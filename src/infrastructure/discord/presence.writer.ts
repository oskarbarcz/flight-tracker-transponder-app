import type { Presence } from '../../application/ports/presence';

export type DiscordActivity = {
  details: string;
  state: string;
  startTimestamp?: number;
  endTimestamp?: number;
  largeImageKey: string;
  smallImageKey: string;
};

export function toDiscordActivity(payload: Presence): DiscordActivity {
  const startTimestamp = toEpochMs(payload.startTimestamp);
  const endTimestamp = toEpochMs(payload.endTimestamp);

  return {
    details: payload.details,
    state: payload.state,
    ...(startTimestamp !== undefined ? { startTimestamp } : {}),
    ...(endTimestamp !== undefined ? { endTimestamp } : {}),
    largeImageKey: payload.largeImageKey,
    smallImageKey: payload.smallImageKey,
  };
}

function toEpochMs(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : undefined;
}
