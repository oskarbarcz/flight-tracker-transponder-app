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
  simSampleIntervalMs: number;
  queueCapacity: number;
  logLevel: LogLevel;
  logFilePath: string;
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const DEFAULTS = {
  presencePollIntervalMs: 15_000,
  currentFlightPollIntervalMs: 30_000,
  simSampleIntervalMs: 1_000,
  queueCapacity: 3_600,
  logLevel: 'info' as LogLevel,
};

export class MissingConfigurationError extends Error {
  constructor(key: string) {
    super(`Configuration key ${key} is required but was not provided.`);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    apiBaseUrl: trimTrailingSlash(required(env, 'API_BASE_URL')),
    adsbBaseUrl: trimTrailingSlash(required(env, 'ADSB_BASE_URL')),
    discordApplicationId: required(env, 'DISCORD_APPLICATION_ID'),
    simConnectRemote: simConnectRemote(env),
    presencePollIntervalMs: number(
      env.PRESENCE_POLL_INTERVAL_MS,
      DEFAULTS.presencePollIntervalMs,
    ),
    currentFlightPollIntervalMs: number(
      env.CURRENT_FLIGHT_POLL_INTERVAL_MS,
      DEFAULTS.currentFlightPollIntervalMs,
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

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];

  if (value === undefined || value.trim() === '') {
    throw new MissingConfigurationError(key);
  }

  return value.trim();
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
