import { isUpdateAvailable, ReleaseClient } from './release.client';

function respond(body: unknown, status = 200): typeof fetch {
  return (() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    })) as unknown as typeof fetch;
}

describe('ReleaseClient', () => {
  it('reads the tag of the newest release', async () => {
    const client = new ReleaseClient(
      'https://x',
      respond({ tag_name: '0.8.0' }),
    );

    await expect(client.latest()).resolves.toBe('0.8.0');
  });

  // This repository tags bare versions, but the leading v is the commoner
  // convention and costs nothing to tolerate.
  it('tolerates a leading v', async () => {
    const client = new ReleaseClient(
      'https://x',
      respond({ tag_name: 'v1.2.3' }),
    );

    await expect(client.latest()).resolves.toBe('1.2.3');
  });

  it('refuses a release with no tag', async () => {
    const client = new ReleaseClient('https://x', respond({}));

    await expect(client.latest()).rejects.toThrow('no tag');
  });

  it('reports the status when GitHub turns us away', async () => {
    const client = new ReleaseClient('https://x', respond({}, 403));

    await expect(client.latest()).rejects.toThrow('403');
  });
});

describe('isUpdateAvailable', () => {
  it.each([
    ['0.7.0', '0.8.0', true],
    ['0.7.0', '0.7.1', true],
    ['0.7.0', '1.0.0', true],
    ['0.9.0', '0.10.0', true],
    ['0.7.0', '0.7.0', false],
    ['0.8.0', '0.7.0', false],
    ['1.0.0', '0.9.9', false],
  ])('%s against %s is %s', (running, latest, expected) => {
    expect(isUpdateAvailable(running, latest)).toBe(expected);
  });

  it('says nothing when the newest release is unknown', () => {
    expect(isUpdateAvailable('0.7.0', null)).toBe(false);
  });

  // A build straight from source calls itself `dev`. Comparing that to anything
  // would offer an update on every run of every development session.
  it.each([
    ['dev', '9.9.9'],
    ['0.7.0', 'nightly'],
    ['', '1.0.0'],
  ])('stays quiet for the unparseable pair %s / %s', (running, latest) => {
    expect(isUpdateAvailable(running, latest)).toBe(false);
  });
});
