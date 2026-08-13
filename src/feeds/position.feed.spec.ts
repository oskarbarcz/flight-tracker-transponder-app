import { PositionFeed } from './position.feed';
import {
  type AdsbClient,
  AdsbPublishFailedError,
  AdsbTokenRejectedError,
} from '../adsb/adsb.client';
import { PositionQueue } from '../domain/position-queue';
import type { PositionReport } from '../domain/position-report';
import { RatePolicy } from '../domain/rate-policy';
import type { SimSample } from '../domain/sim-sample';
import { Logger } from '../core/logger';
import { StatusRegistry } from '../core/status';

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

type Harness = {
  feed: PositionFeed;
  published: PositionReport[];
  attempts: () => number;
  queue: PositionQueue;
  status: StatusRegistry;
  failWith: (error: Error | null) => void;
  advance: (ms: number) => void;
};

function harness(capacity = 10): Harness {
  const published: PositionReport[] = [];
  let failure: Error | null = null;
  let attempts = 0;
  let clock = Date.UTC(2026, 7, 13, 12, 0, 0);

  const adsb = {
    publish: (report: PositionReport) => {
      attempts += 1;

      if (failure !== null) {
        return Promise.reject(failure);
      }
      published.push(report);
      return Promise.resolve();
    },
  } as unknown as AdsbClient;

  const queue = new PositionQueue(capacity);
  const status = new StatusRegistry();

  return {
    feed: new PositionFeed(
      adsb,
      queue,
      new RatePolicy(),
      status,
      new Logger('error', '/dev/null'),
      () => clock,
    ),
    published,
    attempts: () => attempts,
    queue,
    status,
    failWith: (error) => {
      failure = error;
    },
    advance: (ms) => {
      clock += ms;
    },
  };
}

describe('PositionFeed', () => {
  it('publishes under the flight callsign, normalised', async () => {
    const { feed, published } = harness();
    feed.setCurrentFlightCallsign('aal 4908');

    feed.accept(sample());
    await feed.drain();

    expect(published).toHaveLength(1);
    expect(published[0]?.callsign).toBe('AAL4908');
  });

  it('publishes nothing while there is no current flight', async () => {
    const { feed, published, status } = harness();
    feed.setCurrentFlightCallsign(null);

    feed.accept(sample());
    await feed.drain();

    expect(published).toHaveLength(0);
    expect(status.snapshot().connections.adsb).toBe('waiting-for-flight');
  });

  it('switches callsign when the current flight changes', async () => {
    const { feed, published } = harness();
    feed.setCurrentFlightCallsign('AAL4908');
    feed.accept(sample());
    await feed.drain();

    feed.setCurrentFlightCallsign('DLH42');
    feed.accept(sample());
    await feed.drain();

    expect(published.map((report) => report.callsign)).toEqual([
      'AAL4908',
      'DLH42',
    ]);
  });

  it('keeps sampled timestamps when a publish is retried', async () => {
    const { feed, published, failWith, advance } = harness();
    feed.setCurrentFlightCallsign('AAL4908');

    failWith(new AdsbPublishFailedError(503));
    feed.accept(sample({ sampledAt: new Date('2026-08-13T12:00:00.000Z') }));
    await feed.drain();
    feed.accept(sample({ sampledAt: new Date('2026-08-13T12:00:01.000Z') }));
    await feed.drain();

    expect(published).toHaveLength(0);

    failWith(null);
    advance(60_000);
    await feed.drain();

    expect(published.map((report) => report.date)).toEqual([
      '2026-08-13T12:00:00.000Z',
      '2026-08-13T12:00:01.000Z',
    ]);
  });

  it('reports the ADS-B service as unauthorised on a rejected token', async () => {
    const { feed, status, failWith } = harness();
    feed.setCurrentFlightCallsign('AAL4908');
    failWith(new AdsbTokenRejectedError());

    feed.accept(sample());
    await feed.drain();

    expect(status.snapshot().connections.adsb).toBe('unauthorised');
  });

  it('drops the oldest reports when an outage outlasts the queue', async () => {
    const { feed, queue, status, failWith, advance } = harness(3);
    feed.setCurrentFlightCallsign('AAL4908');
    failWith(new AdsbPublishFailedError(503));

    for (let second = 0; second < 6; second += 1) {
      feed.accept(
        sample({
          sampledAt: new Date(Date.UTC(2026, 7, 13, 12, 0, second)),
        }),
      );
      advance(1_000);
      await feed.drain();
    }

    expect(queue.size).toBe(3);
    expect(queue.peek()?.date).toBe('2026-08-13T12:00:03.000Z');
    expect(status.snapshot().droppedCount).toBe(3);
  });

  it('skips the null island the API would discard anyway', async () => {
    const { feed, published } = harness();
    feed.setCurrentFlightCallsign('AAL4908');

    feed.accept(sample({ latitude: 0, longitude: 0 }));
    await feed.drain();

    expect(published).toHaveLength(0);
  });

  it('backs off instead of retrying on every tick during an outage', async () => {
    const { feed, attempts, failWith, advance } = harness();
    feed.setCurrentFlightCallsign('AAL4908');
    failWith(new AdsbPublishFailedError(503));

    for (let second = 0; second < 10; second += 1) {
      feed.accept(
        sample({ sampledAt: new Date(Date.UTC(2026, 7, 13, 12, 0, second)) }),
      );
      advance(1_000);
      await feed.drain();
    }

    expect(attempts()).toBeLessThan(6);
    expect(attempts()).toBeGreaterThan(1);
  });

  it('resumes at full rate once a publish succeeds', async () => {
    const { feed, published, failWith, advance } = harness();
    feed.setCurrentFlightCallsign('AAL4908');

    failWith(new AdsbPublishFailedError(503));
    feed.accept(
      sample({ sampledAt: new Date(Date.UTC(2026, 7, 13, 12, 0, 0)) }),
    );
    await feed.drain();

    failWith(null);
    advance(60_000);
    await feed.drain();

    feed.accept(
      sample({ sampledAt: new Date(Date.UTC(2026, 7, 13, 12, 1, 0)) }),
    );
    await feed.drain();

    expect(published).toHaveLength(2);
  });

  it('counts accepted reports for the status view', async () => {
    const { feed, status } = harness();
    feed.setCurrentFlightCallsign('AAL4908');

    feed.accept(sample({ sampledAt: new Date('2026-08-13T12:00:00.000Z') }));
    await feed.drain();
    feed.accept(sample({ sampledAt: new Date('2026-08-13T12:00:01.000Z') }));
    await feed.drain();

    expect(status.snapshot().publishedCount).toBe(2);
    expect(status.snapshot().lastAcceptedReportAt).toEqual(
      new Date('2026-08-13T12:00:01.000Z'),
    );
  });
});
