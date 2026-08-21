import type { Release } from '../api/release.client';
import { StatusRegistry } from '../core/status';
import type { Downloader, DownloadRequest } from './downloader';
import { Updater } from './updater';

function release(overrides: Partial<Release> = {}): Release {
  return {
    version: '0.12.0',
    pageUrl: 'https://github.test/releases/0.12.0',
    asset: {
      name: 'mypreflight-transponder.exe',
      url: 'https://github.test/mypreflight-transponder.exe',
      sizeBytes: 4096,
      digest: 'sha256:abc',
    },
    ...overrides,
  };
}

function logs(): {
  logger: {
    info: (m: string) => void;
    warn: (m: string) => void;
    error: (m: string) => void;
  };
  lines: string[];
} {
  const lines: string[] = [];

  return {
    lines,
    logger: {
      info: (message) => lines.push(`info ${message}`),
      warn: (message) => lines.push(`warn ${message}`),
      error: (message) => lines.push(`error ${message}`),
    },
  };
}

function downloader(
  behaviour: (request: DownloadRequest) => Promise<void> = () =>
    Promise.resolve(),
): { downloader: Downloader; requests: DownloadRequest[] } {
  const requests: DownloadRequest[] = [];

  return {
    requests,
    downloader: {
      fetchTo: (request: DownloadRequest) => {
        requests.push(request);

        return behaviour(request);
      },
    } as unknown as Downloader,
  };
}

function updater(
  overrides: {
    downloader?: Downloader;
    directory?: () => Promise<string>;
    prepare?: (directory: string) => boolean;
  } = {},
): { updater: Updater; status: StatusRegistry; lines: string[] } {
  const status = new StatusRegistry();
  const { logger, lines } = logs();

  return {
    status,
    lines,
    updater: new Updater(
      overrides.downloader ?? downloader().downloader,
      status,
      logger,
      overrides.directory ?? (() => Promise.resolve('/Users/pilot/Downloads')),
      (directory, fileName) => `${directory}/${fileName}`,
      overrides.prepare ?? (() => true),
    ),
  };
}

describe('Updater', () => {
  it('saves the release into the downloads folder under its version', async () => {
    const asked = downloader();
    const { updater: subject, status } = updater({
      downloader: asked.downloader,
    });

    await expect(subject.download(release())).resolves.toBe(
      '/Users/pilot/Downloads/mypreflight-transponder-0.12.0.exe',
    );

    expect(asked.requests[0]).toMatchObject({
      url: 'https://github.test/mypreflight-transponder.exe',
      expectedBytes: 4096,
      digest: 'sha256:abc',
    });
    expect(status.snapshot().update).toEqual({
      phase: 'saved',
      path: '/Users/pilot/Downloads/mypreflight-transponder-0.12.0.exe',
    });
  });

  it('publishes progress while the bytes arrive', async () => {
    const asked = downloader((request) => {
      request.onProgress?.(1024, 4096);

      return Promise.resolve();
    });
    const { updater: subject, status } = updater({
      downloader: asked.downloader,
    });
    const seen: unknown[] = [];
    const original = status.setUpdate.bind(status);
    status.setUpdate = (update) => {
      seen.push(update);
      original(update);
    };

    await subject.download(release());

    expect(seen).toContainEqual({
      phase: 'downloading',
      receivedBytes: 1024,
      totalBytes: 4096,
    });
  });

  it('tells the pilot where to look when the release has no executable', async () => {
    const { updater: subject, status, lines } = updater();

    await expect(
      subject.download(release({ asset: null })),
    ).resolves.toBeNull();

    expect(status.snapshot().update).toEqual({
      phase: 'failed',
      reason:
        'release v0.12.0 carries no Windows executable; see https://github.test/releases/0.12.0',
    });
    expect(lines.some((line) => line.startsWith('error'))).toBe(true);
  });

  it('reports a downloads folder it cannot write to', async () => {
    const { updater: subject, status } = updater({ prepare: () => false });

    await expect(subject.download(release())).resolves.toBeNull();

    expect(status.snapshot().update).toEqual({
      phase: 'failed',
      reason: '/Users/pilot/Downloads cannot be written to',
    });
  });

  it('reports a download that went wrong', async () => {
    const asked = downloader(() =>
      Promise.reject(new Error('the connection dropped')),
    );
    const { updater: subject, status } = updater({
      downloader: asked.downloader,
    });

    await expect(subject.download(release())).resolves.toBeNull();

    expect(status.snapshot().update).toEqual({
      phase: 'failed',
      reason: 'the connection dropped',
    });
  });

  it('refuses to run twice at once', async () => {
    let finish: () => void = () => undefined;
    const asked = downloader(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { updater: subject, lines } = updater({
      downloader: asked.downloader,
    });

    const first = subject.download(release());
    await Promise.resolve();

    expect(subject.running).toBe(true);
    await expect(subject.download(release())).resolves.toBeNull();
    expect(lines).toContain('warn the update is already downloading');

    finish();
    await first;

    expect(subject.running).toBe(false);
    expect(asked.requests).toHaveLength(1);
  });
});
