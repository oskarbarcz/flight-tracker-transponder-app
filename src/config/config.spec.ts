import { loadConfig, MissingConfigurationError } from './config';

const minimal = {
  API_BASE_URL: 'https://flights.example.com',
  ADSB_BASE_URL: 'https://adsb.example.com',
  DISCORD_APPLICATION_ID: '1234567890',
};

describe('loadConfig', () => {
  it('reads the required keys and applies the defaults', () => {
    const config = loadConfig(minimal);

    expect(config.apiBaseUrl).toBe('https://flights.example.com');
    expect(config.presencePollIntervalMs).toBe(15_000);
    expect(config.simSampleIntervalMs).toBe(1_000);
    expect(config.queueCapacity).toBe(3_600);
    expect(config.logLevel).toBe('info');
  });

  it.each(['API_BASE_URL', 'ADSB_BASE_URL', 'DISCORD_APPLICATION_ID'])(
    'refuses to start without %s',
    (key) => {
      const env = { ...minimal, [key]: '' };

      expect(() => loadConfig(env)).toThrow(MissingConfigurationError);
    },
  );

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

  it('falls back to a sane value for an unusable interval', () => {
    const config = loadConfig({
      ...minimal,
      PRESENCE_POLL_INTERVAL_MS: 'soon',
      QUEUE_CAPACITY: '-5',
    });

    expect(config.presencePollIntervalMs).toBe(15_000);
    expect(config.queueCapacity).toBe(3_600);
  });
});
