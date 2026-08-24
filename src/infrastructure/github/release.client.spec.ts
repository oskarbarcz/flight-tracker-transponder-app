import { ReleaseClient } from './release.client';

function respond(body: unknown, status = 200): typeof fetch {
  return (() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    })) as unknown as typeof fetch;
}

function asset(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    browser_download_url: `https://github.test/${name}`,
    size: 60_000_000,
    ...extra,
  };
}

describe('ReleaseClient', () => {
  it('reads the tag of the newest release', async () => {
    const client = new ReleaseClient(
      'https://x',
      respond({ tag_name: '0.8.0' }),
    );

    await expect(client.latest()).resolves.toMatchObject({ version: '0.8.0' });
  });

  it('tolerates a leading v', async () => {
    const client = new ReleaseClient(
      'https://x',
      respond({ tag_name: 'v1.2.3' }),
    );

    await expect(client.latest()).resolves.toMatchObject({ version: '1.2.3' });
  });

  it('refuses a release with no tag', async () => {
    const client = new ReleaseClient('https://x', respond({}));

    await expect(client.latest()).rejects.toThrow('no tag');
  });

  it('reports the status when GitHub turns us away', async () => {
    const client = new ReleaseClient('https://x', respond({}, 403));

    await expect(client.latest()).rejects.toThrow('403');
  });

  it('picks the Windows executable out of the assets', async () => {
    const client = new ReleaseClient(
      'https://x',
      respond({
        tag_name: '0.12.0',
        html_url: 'https://github.test/releases/0.12.0',
        assets: [
          asset('checksums.txt'),
          asset('mypreflight-transponder.exe', {
            digest: 'sha256:abc',
            size: 57_000_000,
          }),
        ],
      }),
    );

    await expect(client.latest()).resolves.toEqual({
      version: '0.12.0',
      pageUrl: 'https://github.test/releases/0.12.0',
      asset: {
        name: 'mypreflight-transponder.exe',
        url: 'https://github.test/mypreflight-transponder.exe',
        sizeBytes: 57_000_000,
        digest: 'sha256:abc',
      },
    });
  });

  it('settles for any executable when the expected name is absent', async () => {
    const client = new ReleaseClient(
      'https://x',
      respond({ tag_name: '0.12.0', assets: [asset('transponder-x64.exe')] }),
    );

    const release = await client.latest();

    expect(release.asset?.name).toBe('transponder-x64.exe');
    expect(release.asset?.digest).toBeNull();
  });

  it('reports no asset when the release carries nothing to download', async () => {
    const client = new ReleaseClient(
      'https://x',
      respond({ tag_name: '0.12.0', assets: [asset('notes.md')] }),
    );

    await expect(client.latest()).resolves.toMatchObject({ asset: null });
  });
});
