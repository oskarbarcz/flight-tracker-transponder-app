import { toDiscordActivity } from './presence.writer';

const payload = {
  state: 'Cruise, landing at 15:50 UTC',
  details: 'Boston (BOS) -> Philadelphia (PHL)',
  startTimestamp: '2025-01-01T13:00:00.000Z',
  endTimestamp: '2025-01-01T15:50:00.000Z',
  smallImageKey: 'flight-tracker',
  largeImageKey: 'msfs2024',
};

describe('toDiscordActivity', () => {
  it('passes the API text through untouched and converts the timestamps', () => {
    expect(toDiscordActivity(payload)).toEqual({
      state: 'Cruise, landing at 15:50 UTC',
      details: 'Boston (BOS) -> Philadelphia (PHL)',
      startTimestamp: Date.UTC(2025, 0, 1, 13, 0, 0),
      endTimestamp: Date.UTC(2025, 0, 1, 15, 50, 0),
      smallImageKey: 'flight-tracker',
      largeImageKey: 'msfs2024',
    });
  });

  it('omits the timers when the payload carries no times', () => {
    const activity = toDiscordActivity({
      ...payload,
      startTimestamp: null,
      endTimestamp: null,
    });

    expect(activity).not.toHaveProperty('startTimestamp');
    expect(activity).not.toHaveProperty('endTimestamp');
    expect(activity.state).toBe('Cruise, landing at 15:50 UTC');
  });

  it('omits a timestamp that cannot be parsed', () => {
    const activity = toDiscordActivity({
      ...payload,
      endTimestamp: 'not-a-date',
    });

    expect(activity).not.toHaveProperty('endTimestamp');
    expect(activity.startTimestamp).toBe(Date.UTC(2025, 0, 1, 13, 0, 0));
  });
});
