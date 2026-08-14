export type SimConnectRemote = {
  host: string;
  port: number;
};

export type Config = {
  apiBaseUrl: string;
  adsbBaseUrl: string;
  discordApplicationId: string;
  simConnectRemote: SimConnectRemote | null;
  presencePollIntervalMs: number;
  currentFlightPollIntervalMs: number;
  versionPollIntervalMs: number;
  simSampleIntervalMs: number;
  queueCapacity: number;
  logLevel: LogLevel;
  logFilePath: string;
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const BUILT_IN = {
  apiBaseUrl: 'https://api.flights.barcz.me',
  adsbBaseUrl: 'https://adsb.barcz.me',
  discordApplicationId: '1536756124894629970',
};

const DEFAULTS = {
  presencePollIntervalMs: 15_000,
  currentFlightPollIntervalMs: 30_000,
  // A version only changes when someone deploys, and reading the API's is a
  // quarter of a megabyte, so this is deliberately slow.
  versionPollIntervalMs: 15 * 60_000,
  simSampleIntervalMs: 1_000,
  queueCapacity: 3_600,
  logLevel: 'info' as LogLevel,
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    apiBaseUrl: trimTrailingSlash(text(env.API_BASE_URL, BUILT_IN.apiBaseUrl)),
    adsbBaseUrl: trimTrailingSlash(
      text(env.ADSB_BASE_URL, BUILT_IN.adsbBaseUrl),
    ),
    discordApplicationId: text(
      env.DISCORD_APPLICATION_ID,
      BUILT_IN.discordApplicationId,
    ),
    simConnectRemote: simConnectRemote(env),
    presencePollIntervalMs: number(
      env.PRESENCE_POLL_INTERVAL_MS,
      DEFAULTS.presencePollIntervalMs,
    ),
    currentFlightPollIntervalMs: number(
      env.CURRENT_FLIGHT_POLL_INTERVAL_MS,
      DEFAULTS.currentFlightPollIntervalMs,
    ),
    versionPollIntervalMs: number(
      env.VERSION_POLL_INTERVAL_MS,
      DEFAULTS.versionPollIntervalMs,
    ),
    simSampleIntervalMs: number(
      env.SIM_SAMPLE_INTERVAL_MS,
      DEFAULTS.simSampleIntervalMs,
    ),
    queueCapacity: number(env.QUEUE_CAPACITY, DEFAULTS.queueCapacity),
    logLevel: logLevel(env.LOG_LEVEL),
    logFilePath: env.LOG_FILE_PATH ?? 'flight-tracker-transponder.log',
  };
}

function simConnectRemote(env: NodeJS.ProcessEnv): SimConnectRemote | null {
  const host = env.SIMCONNECT_HOST?.trim();

  if (host === undefined || host === '') {
    return null;
  }

  return { host, port: number(env.SIMCONNECT_PORT, 500) };
}

function text(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? '';

  return trimmed === '' ? fallback : trimmed;
}

function number(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function logLevel(value: string | undefined): LogLevel {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

  return levels.find((level) => level === value) ?? DEFAULTS.logLevel;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
