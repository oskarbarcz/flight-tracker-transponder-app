import { PresenceFeed } from './presence.feed';
import {
  type DiscordPresencePayload,
  type FlightTrackerClient,
  SessionExpiredError,
} from '../api/flight-tracker.client';
import type {
  DiscordActivity,
  PresenceWriter,
} from '../discord/presence.writer';
import { Logger } from '../core/logger';
import { StatusRegistry } from '../core/status';

const payload: DiscordPresencePayload = {
  state: 'Cruise, landing at 15:50 UTC',
  details: 'Boston (BOS) -> Philadelphia (PHL)',
  startTimestamp: '2025-01-01T13:00:00.000Z',
  endTimestamp: '2025-01-01T15:50:00.000Z',
  smallImageKey: 'flight-tracker',
  largeImageKey: 'msfs2024',
};

class FakeWriter implements PresenceWriter {
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

function feed(presence: () => Promise<DiscordPresencePayload | null>): {
  feed: PresenceFeed;
  writer: FakeWriter;
  status: StatusRegistry;
} {
  const writer = new FakeWriter();
  const status = new StatusRegistry();
  const api = {
    getDiscordPresence: presence,
  } as unknown as FlightTrackerClient;

  return {
    feed: new PresenceFeed(
      api,
      writer,
      status,
      new Logger('error', '/dev/null'),
    ),
    writer,
    status,
  };
}

describe('PresenceFeed', () => {
  it('publishes the activity the API returns', async () => {
    const { feed: presenceFeed, writer } = feed(() => Promise.resolve(payload));

    await presenceFeed.tick();

    expect(writer.activities).toHaveLength(1);
    expect(writer.activities[0]?.state).toBe('Cruise, landing at 15:50 UTC');
  });

  it('does not rewrite an unchanged activity', async () => {
    const { feed: presenceFeed, writer } = feed(() => Promise.resolve(payload));

    await presenceFeed.tick();
    await presenceFeed.tick();

    expect(writer.activities).toHaveLength(1);
  });

  it('republishes when the state changes', async () => {
    let current = payload;
    const { feed: presenceFeed, writer } = feed(() => Promise.resolve(current));

    await presenceFeed.tick();
    current = { ...payload, state: 'Taxiing in' };
    await presenceFeed.tick();

    expect(writer.activities.map((activity) => activity.state)).toEqual([
      'Cruise, landing at 15:50 UTC',
      'Taxiing in',
    ]);
  });

  it('clears the activity when the API has nothing to publish', async () => {
    let current: DiscordPresencePayload | null = payload;
    const { feed: presenceFeed, writer } = feed(() => Promise.resolve(current));

    await presenceFeed.tick();
    current = null;
    await presenceFeed.tick();

    expect(writer.clears).toBe(1);
  });

  it('does not clear repeatedly while there is nothing to publish', async () => {
    const { feed: presenceFeed, writer } = feed(() => Promise.resolve(null));

    await presenceFeed.tick();
    await presenceFeed.tick();

    expect(writer.clears).toBe(0);
  });

  it('leaves the activity in place when the poll fails', async () => {
    let fail = false;
    const {
      feed: presenceFeed,
      writer,
      status,
    } = feed(() =>
      fail ? Promise.reject(new Error('offline')) : Promise.resolve(payload),
    );

    await presenceFeed.tick();
    fail = true;
    await presenceFeed.tick();

    expect(writer.clears).toBe(0);
    expect(writer.activities).toHaveLength(1);
    expect(status.snapshot().connections.api).toBe('disconnected');
  });

  it('clears the activity when the session is gone', async () => {
    let expired = false;
    const {
      feed: presenceFeed,
      writer,
      status,
    } = feed(() =>
      expired
        ? Promise.reject(new SessionExpiredError())
        : Promise.resolve(payload),
    );

    await presenceFeed.tick();
    expired = true;
    await presenceFeed.tick();

    expect(writer.clears).toBe(1);
    expect(status.snapshot().connections.api).toBe('unauthorised');
  });
});
