import { join } from 'node:path';
import { BUILT_IN, loadConfig } from './config';

const minimal = {
  API_BASE_URL: 'https://flights.example.com',
  ADSB_BASE_URL: 'https://adsb.example.com',
  DISCORD_APPLICATION_ID: '1234567890',
};

describe('loadConfig', () => {
  it('reads the environment and applies the defaults', () => {
    const config = loadConfig(minimal);

    expect(config.apiBaseUrl).toBe('https://flights.example.com');
    expect(config.presencePollIntervalMs).toBe(15_000);
    expect(config.simSampleIntervalMs).toBe(1_000);
    expect(config.queueCapacity).toBe(360);
    expect(config.logLevel).toBe('info');
    expect(config.versionPollIntervalMs).toBe(900_000);
  });

  it('starts with nothing configured at all', () => {
    const config = loadConfig({});

    expect(config.apiBaseUrl).toBe(BUILT_IN.apiBaseUrl);
    expect(config.adsbBaseUrl).toBe(BUILT_IN.adsbBaseUrl);
    expect(config.discordApplicationId).toBe(BUILT_IN.discordApplicationId);
  });

  it.each([
    ['API_BASE_URL', 'apiBaseUrl', BUILT_IN.apiBaseUrl],
    ['ADSB_BASE_URL', 'adsbBaseUrl', BUILT_IN.adsbBaseUrl],
    [
      'DISCORD_APPLICATION_ID',
      'discordApplicationId',
      BUILT_IN.discordApplicationId,
    ],
  ] as const)(
    'falls back to the built-in value when %s is blank',
    (key, field, expected) => {
      const config = loadConfig({ ...minimal, [key]: '   ' });

      expect(config[field]).toBe(expected);
    },
  );

  it('lets the environment override a built-in value', () => {
    const config = loadConfig({ API_BASE_URL: 'https://staging.example.com' });

    expect(config.apiBaseUrl).toBe('https://staging.example.com');
    expect(config.adsbBaseUrl).toBe(BUILT_IN.adsbBaseUrl);
  });

  it('trims a trailing slash off the base urls', () => {
    const config = loadConfig({
      ...minimal,
      API_BASE_URL: 'https://flights.example.com/',
      ADSB_BASE_URL: 'https://adsb.example.com///',
    });

    expect(config.apiBaseUrl).toBe('https://flights.example.com');
    expect(config.adsbBaseUrl).toBe('https://adsb.example.com');
  });

  it('connects to the simulator locally when no host is given', () => {
    expect(loadConfig(minimal).simConnectRemote).toBeNull();
  });

  it('connects over the network when a host is given', () => {
    const config = loadConfig({ ...minimal, SIMCONNECT_HOST: '192.168.1.20' });

    expect(config.simConnectRemote).toEqual({
      host: '192.168.1.20',
      port: 500,
    });
  });

  it('takes the port from the environment when it is set', () => {
    const config = loadConfig({
      ...minimal,
      SIMCONNECT_HOST: '192.168.1.20',
      SIMCONNECT_PORT: '5001',
    });

    expect(config.simConnectRemote?.port).toBe(5001);
  });

  it('keeps the log beside the app rather than in the working directory', () => {
    expect(loadConfig(minimal, '/opt/app').logFilePath).toBe(
      join('/opt/app', 'mypreflight-transponder.log'),
    );
  });

  it('resolves a relative log path against the same folder', () => {
    expect(
      loadConfig({ ...minimal, LOG_FILE_PATH: 'logs/app.log' }, '/opt/app')
        .logFilePath,
    ).toBe(join('/opt/app', 'logs', 'app.log'));
  });

  it('leaves an absolute log path alone', () => {
    const absolute = join('/var', 'log', 'transponder.log');

    expect(
      loadConfig({ ...minimal, LOG_FILE_PATH: absolute }, '/opt/app')
        .logFilePath,
    ).toBe(absolute);
  });

  it('falls back to a sane value for an unusable interval', () => {
    const config = loadConfig({
      ...minimal,
      PRESENCE_POLL_INTERVAL_MS: 'soon',
      QUEUE_CAPACITY: '-5',
    });

    expect(config.presencePollIntervalMs).toBe(15_000);
    expect(config.queueCapacity).toBe(360);
  });
  it('looks for GSX on the local machine, with nothing configured', () => {
    expect(loadConfig({}).gsx).toEqual({
      enabled: true,
      host: BUILT_IN.gsxHost,
      port: BUILT_IN.gsxPort,
    });
  });

  it('points GSX at the machine running the simulator', () => {
    expect(
      loadConfig({ ...minimal, GSX_HOST: 'sim.lan', GSX_PORT: '9001' }).gsx,
    ).toMatchObject({ host: 'sim.lan', port: 9001 });
  });

  it('falls back to the built-in GSX endpoint when it is unusable', () => {
    expect(
      loadConfig({ ...minimal, GSX_HOST: '   ', GSX_PORT: 'nowhere' }).gsx,
    ).toMatchObject({ host: BUILT_IN.gsxHost, port: BUILT_IN.gsxPort });
  });

  it.each(['false', '0', 'off', 'no', 'FALSE', ' Off '])(
    'switches the GSX integration off for %s',
    (value) => {
      expect(loadConfig({ ...minimal, GSX_ENABLED: value }).gsx.enabled).toBe(
        false,
      );
    },
  );

  it.each(['true', '1', 'on', 'yes', ''])(
    'leaves the GSX integration on for %s',
    (value) => {
      expect(loadConfig({ ...minimal, GSX_ENABLED: value }).gsx.enabled).toBe(
        true,
      );
    },
  );

  it('leaves the GSX integration on when the switch is not a switch', () => {
    expect(loadConfig({ ...minimal, GSX_ENABLED: 'perhaps' }).gsx.enabled).toBe(
      true,
    );
  });
});
