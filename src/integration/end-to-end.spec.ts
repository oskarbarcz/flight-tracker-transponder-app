import { StubService } from './stub-services';
import {
  FlightTrackerClient,
  SessionExpiredError,
} from '../api/flight-tracker.client';
import { InMemoryTokenStore } from '../api/token-store';
import { AdsbClient, AdsbTokenRejectedError } from '../adsb/adsb.client';
import { PositionFeed } from '../feeds/position.feed';
import { PresenceFeed } from '../feeds/presence.feed';
import { PositionQueue } from '../domain/position-queue';
import { RatePolicy } from '../domain/rate-policy';
import type { SimSample } from '../domain/sim-sample';
import { StatusRegistry } from '../core/status';
import { Logger } from '../core/logger';
import type {
  DiscordActivity,
  PresenceWriter,
} from '../discord/presence.writer';

const FLIGHT_ID = '0f0f6b04-9a5f-4e6c-9c4e-1d2f0f38a3b1';

const presencePayload = {
  state: 'Cruise, landing at 15:50 UTC',
  details: 'Boston (BOS) -> Philadelphia (PHL)',
  startTimestamp: '2025-01-01T13:00:00.000Z',
  endTimestamp: '2025-01-01T15:50:00.000Z',
  smallImageKey: 'flight-tracker',
  largeImageKey: 'msfs2024',
};

class RecordingWriter implements PresenceWriter {
  activities: DiscordActivity[] = [];
  clears = 0;

  connect(): Promise<void> {
    return Promise.resolve();
  }

  setActivity(activity: DiscordActivity): Promise<void> {
    this.activities.push(activity);
    return Promise.resolve();
  }

  clearActivity(): Promise<void> {
    this.clears += 1;
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }
}

function sample(overrides: Partial<SimSample> = {}): SimSample {
  return {
    sampledAt: new Date('2026-08-13T12:00:00.000Z'),
    latitude: 42.36454,
    longitude: -71.01663,
    altitude: 35000,
    groundSpeed: 456,
    track: 271.5,
    verticalRate: -12,
    isOnGround: false,
    transponderCodeBcd: 0x1200,
    aircraftIdentifier: 'N720AN',
    ...overrides,
  };
}

function silentLogger(): Logger {
  return new Logger('error', '/dev/null');
}

describe('flight-tracker API integration', () => {
  let api: StubService;
  let presenceStatus = 200;
  let refreshes = 0;
  let accessTokensIssued = 0;

  beforeEach(async () => {
    presenceStatus = 200;
    refreshes = 0;
    accessTokensIssued = 0;

    api = new StubService({
      'POST /api/v1/auth/sign-in': () => {
        accessTokensIssued += 1;
        return {
          status: 200,
          body: {
            accessToken: `access-${accessTokensIssued}`,
            refreshToken: 'refresh-1',
          },
        };
      },
      'POST /api/v1/auth/refresh': (request) => {
        refreshes += 1;

        if (request.authorization !== 'Bearer refresh-1') {
          return { status: 401 };
        }

        accessTokensIssued += 1;

        return {
          status: 200,
          body: {
            accessToken: `access-${accessTokensIssued}`,
            refreshToken: 'refresh-1',
          },
        };
      },
      'GET /api/v1/user/me': () => ({
        status: 200,
        body: { currentFlightId: FLIGHT_ID },
      }),
      [`GET /api/v1/flight/${FLIGHT_ID}`]: () => ({
        status: 200,
        body: { id: FLIGHT_ID, callsign: 'AAL 4908' },
      }),
      'GET /api/v1/user/me/discord-presence': () =>
        presenceStatus === 204
          ? { status: 204 }
          : { status: 200, body: presencePayload },
    });

    await api.start();
  });

  afterEach(async () => {
    await api.stop();
  });

  function client(now: () => number = () => Date.now()): FlightTrackerClient {
    return new FlightTrackerClient(
      api.baseUrl,
      new InMemoryTokenStore(),
      fetch,
      now,
    );
  }

  it('signs in and resolves the current flight callsign', async () => {
    const flightTracker = client();
    await flightTracker.signIn('pilot@example.com', 'P@$$w0rd');

    const flight = await flightTracker.getCurrentFlight();

    expect(flight).toEqual({ id: FLIGHT_ID, callsign: 'AAL 4908' });
    expect(api.requestsTo('/api/v1/user/me')[0]?.authorization).toBe(
      'Bearer access-1',
    );
  });

  it('renews with the refresh token as the bearer and no body', async () => {
    let clock = Date.UTC(2026, 7, 13, 12, 0, 0);
    const flightTracker = client(() => clock);
    await flightTracker.signIn('pilot@example.com', 'P@$$w0rd');

    clock += 15 * 60 * 1000;
    await flightTracker.getCurrentFlight();

    const refresh = api.requestsTo('/api/v1/auth/refresh')[0];

    expect(refreshes).toBe(1);
    expect(refresh?.authorization).toBe('Bearer refresh-1');
    expect(refresh?.body).toBe('');
    expect(api.requestsTo('/api/v1/user/me')[0]?.authorization).toBe(
      'Bearer access-2',
    );
  });

  it('gives up on a session the API no longer accepts', async () => {
    const store = new InMemoryTokenStore();
    await store.write({ refreshToken: 'stale' });
    const flightTracker = new FlightTrackerClient(api.baseUrl, store, fetch);

    await expect(flightTracker.getCurrentFlight()).rejects.toThrow(
      SessionExpiredError,
    );
    expect(await store.read()).toBeNull();
  });

  it('publishes the activity on a payload and clears it on no content', async () => {
    const flightTracker = client();
    await flightTracker.signIn('pilot@example.com', 'P@$$w0rd');

    const writer = new RecordingWriter();
    const feed = new PresenceFeed(
      flightTracker,
      writer,
      new StatusRegistry(),
      silentLogger(),
    );

    await feed.tick();
    presenceStatus = 204;
    await feed.tick();

    expect(writer.activities).toHaveLength(1);
    expect(writer.activities[0]).toEqual({
      state: 'Cruise, landing at 15:50 UTC',
      details: 'Boston (BOS) -> Philadelphia (PHL)',
      startTimestamp: Date.UTC(2025, 0, 1, 13, 0, 0),
      endTimestamp: Date.UTC(2025, 0, 1, 15, 50, 0),
      smallImageKey: 'flight-tracker',
      largeImageKey: 'msfs2024',
    });
    expect(writer.clears).toBe(1);
  });
});

describe('ADS-B service integration', () => {
  let adsbService: StubService;
  let publishStatus = 200;

  beforeEach(async () => {
    publishStatus = 200;

    adsbService = new StubService({
      'POST /api/v1/auth-check/client': (request) =>
        request.authorization === 'Bearer client-token'
          ? { status: 200, body: { ok: true } }
          : { status: 401 },
      'POST /api/v1/position': () => ({ status: publishStatus }),
    });

    await adsbService.start();
  });

  afterEach(async () => {
    await adsbService.stop();
  });

  function feedFor(token = 'client-token'): {
    feed: PositionFeed;
    status: StatusRegistry;
    advance: (ms: number) => void;
  } {
    const status = new StatusRegistry();
    let clock = Date.UTC(2026, 7, 13, 12, 0, 0);
    const feed = new PositionFeed(
      new AdsbClient(adsbService.baseUrl, token),
      new PositionQueue(10),
      new RatePolicy(),
      status,
      silentLogger(),
      () => clock,
    );

    feed.setCurrentFlightCallsign('AAL 4908');

    return {
      feed,
      status,
      advance: (ms) => {
        clock += ms;
      },
    };
  }

  it('accepts a valid client token and rejects a wrong one', async () => {
    await expect(
      new AdsbClient(adsbService.baseUrl, 'client-token').verifyToken(),
    ).resolves.toBeUndefined();

    await expect(
      new AdsbClient(adsbService.baseUrl, 'wrong').verifyToken(),
    ).rejects.toThrow(AdsbTokenRejectedError);
  });

  it('publishes a report the ADS-B contract accepts', async () => {
    const { feed } = feedFor();

    feed.accept(sample());
    await feed.drain();

    const published = adsbService.requestsTo('/api/v1/position');

    expect(published).toHaveLength(1);
    expect(published[0]?.authorization).toBe('Bearer client-token');
    expect(JSON.parse(published[0]?.body ?? '{}')).toEqual({
      callsign: 'AAL4908',
      date: '2026-08-13T12:00:00.000Z',
      latitude: 42.36454,
      longitude: -71.01663,
      altitude: 35000,
      groundSpeed: 456,
      track: 271.5,
      verticalRate: -12,
      squawk: '1200',
      isOnGround: false,
      alert: false,
      emergency: false,
      spi: false,
    });
  });

  it('recovers from an outage without losing or reordering reports', async () => {
    const { feed, advance } = feedFor();

    publishStatus = 503;

    for (let second = 0; second < 3; second += 1) {
      feed.accept(
        sample({ sampledAt: new Date(Date.UTC(2026, 7, 13, 12, 0, second)) }),
      );
      advance(1_000);
      await feed.drain();
    }

    publishStatus = 200;
    feed.accept(
      sample({ sampledAt: new Date(Date.UTC(2026, 7, 13, 12, 0, 3)) }),
    );
    advance(60_000);
    await feed.drain();

    const accepted = adsbService
      .requestsTo('/api/v1/position')
      .map((request) => JSON.parse(request.body).date as string)
      .filter((date, index, dates) => dates.indexOf(date) === index);

    expect(accepted).toEqual([
      '2026-08-13T12:00:00.000Z',
      '2026-08-13T12:00:01.000Z',
      '2026-08-13T12:00:02.000Z',
      '2026-08-13T12:00:03.000Z',
    ]);
  });

  it('stops publishing and reports the state when the token is revoked', async () => {
    const { feed, status } = feedFor();

    publishStatus = 401;
    feed.accept(sample());
    await feed.drain();

    expect(status.snapshot().connections.adsb).toBe('unauthorised');
  });
});
