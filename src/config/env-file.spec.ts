import { envFilePaths, loadEnvFiles } from './env-file';

function reader(files: Record<string, string>) {
  return (path: string): string | null => files[path] ?? null;
}

describe('envFilePaths', () => {
  it('looks in the working directory and beside the executable', () => {
    expect(envFilePaths('/run', '/opt/app/transponder.exe')).toEqual([
      '/run/.env',
      '/opt/app/.env',
    ]);
  });

  it('offers a single path when both resolve to the same file', () => {
    expect(envFilePaths('/opt/app', '/opt/app/transponder.exe')).toEqual([
      '/opt/app/.env',
    ]);
  });
});

describe('loadEnvFiles', () => {
  it('applies the values it finds', () => {
    const env: NodeJS.ProcessEnv = {};

    loadEnvFiles(
      ['/run/.env'],
      env,
      reader({ '/run/.env': 'API_BASE_URL="https://flights.barcz.me"' }),
    );

    expect(env.API_BASE_URL).toBe('https://flights.barcz.me');
  });

  it('never overwrites a variable already in the environment', () => {
    const env: NodeJS.ProcessEnv = { API_BASE_URL: 'https://staging' };

    loadEnvFiles(
      ['/run/.env'],
      env,
      reader({ '/run/.env': 'API_BASE_URL="https://flights.barcz.me"' }),
    );

    expect(env.API_BASE_URL).toBe('https://staging');
  });

  it('lets the first file win over later ones', () => {
    const env: NodeJS.ProcessEnv = {};

    loadEnvFiles(
      ['/run/.env', '/opt/app/.env'],
      env,
      reader({
        '/run/.env': 'LOG_LEVEL="debug"',
        '/opt/app/.env': 'LOG_LEVEL="info"\nQUEUE_CAPACITY="10"',
      }),
    );

    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.QUEUE_CAPACITY).toBe('10');
  });

  it('ignores files that are not there', () => {
    const env: NodeJS.ProcessEnv = {};

    loadEnvFiles(['/run/.env'], env, reader({}));

    expect(env).toEqual({});
  });

  it('skips comments and blank lines', () => {
    const env: NodeJS.ProcessEnv = {};

    loadEnvFiles(
      ['/run/.env'],
      env,
      reader({ '/run/.env': '# a comment\n\nLOG_LEVEL="warn"\n' }),
    );

    expect(env).toEqual({ LOG_LEVEL: 'warn' });
  });
});
