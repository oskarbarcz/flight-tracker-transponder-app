import { resolve } from 'node:path';
import { GSX_HOST, GSX_PORT } from '../gsx/connection';

export type SimConnectRemote = {
  host: string;
  port: number;
};

export type GsxEndpoint = {
  enabled: boolean;
  host: string;
  port: number;
};

export type Config = {
  apiBaseUrl: string;
  adsbBaseUrl: string;
  discordApplicationId: string;
  simConnectRemote: SimConnectRemote | null;
  gsx: GsxEndpoint;
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
  apiBaseUrl: 'https://api.mypreflight.io',
  adsbBaseUrl: 'https://adsb.mypreflight.io',
  discordApplicationId: '1536756124894629970',
  gsxHost: GSX_HOST,
  gsxPort: GSX_PORT,
};

const OFF = ['false', '0', 'off', 'no'];

const ON = ['true', '1', 'on', 'yes'];

export const LOG_FILE_NAME = 'mypreflight-transponder.log';

const DEFAULTS = {
  presencePollIntervalMs: 15_000,
  currentFlightPollIntervalMs: 30_000,
  versionPollIntervalMs: 15 * 60_000,
  simSampleIntervalMs: 1_000,
  queueCapacity: 360,
  logLevel: 'info' as LogLevel,
};

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  directory: string = process.cwd(),
): Config {
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
    gsx: gsxEndpoint(env),
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
    logFilePath: resolve(directory, text(env.LOG_FILE_PATH, LOG_FILE_NAME)),
  };
}

function simConnectRemote(env: NodeJS.ProcessEnv): SimConnectRemote | null {
  const host = env.SIMCONNECT_HOST?.trim();

  if (host === undefined || host === '') {
    return null;
  }

  return { host, port: number(env.SIMCONNECT_PORT, 500) };
}

function gsxEndpoint(env: NodeJS.ProcessEnv): GsxEndpoint {
  return {
    enabled: flag(env.GSX_ENABLED, true),
    host: text(env.GSX_HOST, BUILT_IN.gsxHost),
    port: number(env.GSX_PORT, BUILT_IN.gsxPort),
  };
}

function flag(value: string | undefined, fallback: boolean): boolean {
  const trimmed = value?.trim().toLowerCase() ?? '';

  if (OFF.includes(trimmed)) {
    return false;
  }

  if (ON.includes(trimmed)) {
    return true;
  }

  return fallback;
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
