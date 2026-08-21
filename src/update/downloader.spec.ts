import { createHash } from 'node:crypto';
import { Downloader, type FileSystem } from './downloader';

function serve(
  chunks: string[],
  init: { status?: number; headers?: Record<string, string> } = {},
): typeof fetch {
  return (() => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }

        controller.close();
      },
    });

    return Promise.resolve(
      new Response(body, {
        status: init.status ?? 200,
        headers: init.headers ?? {},
      }),
    );
  }) as unknown as typeof fetch;
}

function memory(): { files: FileSystem; written: Map<string, string> } {
  const partials = new Map<string, string>();
  const written = new Map<string, string>();

  return {
    written,
    files: {
      create: (path) => {
        partials.set(path, '');

        return Promise.resolve({
          write: (chunk) => {
            partials.set(
              path,
              `${partials.get(path) ?? ''}${new TextDecoder().decode(chunk)}`,
            );

            return Promise.resolve();
          },
          close: () => Promise.resolve(),
        });
      },
      move: (from, to) => {
        written.set(to, partials.get(from) ?? '');
        partials.delete(from);

        return Promise.resolve();
      },
      remove: (path) => {
        partials.delete(path);

        return Promise.resolve();
      },
    },
  };
}

const PAYLOAD = 'MZ the executable';

function digestOf(payload: string): string {
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

describe('Downloader', () => {
  it('streams the release to the target file', async () => {
    const { files, written } = memory();

    await new Downloader(serve(['MZ the ', 'executable']), files).fetchTo({
      url: 'https://github.test/app.exe',
      targetPath: '/downloads/app.exe',
    });

    expect(written.get('/downloads/app.exe')).toBe(PAYLOAD);
  });

  it('reports progress against the declared length', async () => {
    const { files } = memory();
    const seen: [number, number | null][] = [];

    await new Downloader(
      serve(['MZ the ', 'executable'], {
        headers: { 'content-length': String(PAYLOAD.length) },
      }),
      files,
    ).fetchTo({
      url: 'https://github.test/app.exe',
      targetPath: '/downloads/app.exe',
      onProgress: (received, total) => seen.push([received, total]),
    });

    expect(seen).toEqual([
      [7, 17],
      [17, 17],
    ]);
  });

  it('accepts a download whose checksum matches', async () => {
    const { files, written } = memory();

    await new Downloader(serve([PAYLOAD]), files).fetchTo({
      url: 'https://github.test/app.exe',
      targetPath: '/downloads/app.exe',
      digest: digestOf(PAYLOAD),
      expectedBytes: PAYLOAD.length,
    });

    expect(written.get('/downloads/app.exe')).toBe(PAYLOAD);
  });

  it('throws away a download whose checksum does not match', async () => {
    const { files, written } = memory();

    await expect(
      new Downloader(serve([PAYLOAD]), files).fetchTo({
        url: 'https://github.test/app.exe',
        targetPath: '/downloads/app.exe',
        digest: digestOf('something else entirely'),
      }),
    ).rejects.toThrow('checksum');

    expect(written.size).toBe(0);
  });

  it('throws away a download that was cut short', async () => {
    const { files, written } = memory();

    await expect(
      new Downloader(serve(['MZ']), files).fetchTo({
        url: 'https://github.test/app.exe',
        targetPath: '/downloads/app.exe',
        expectedBytes: 4096,
      }),
    ).rejects.toThrow('stopped after 2 of 4096 bytes');

    expect(written.size).toBe(0);
  });

  it('never leaves a half-written file when the stream breaks', async () => {
    const { files, written } = memory();
    const failing = (() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('MZ'));
              controller.error(new Error('the connection dropped'));
            },
          }),
        ),
      )) as unknown as typeof fetch;

    await expect(
      new Downloader(failing, files).fetchTo({
        url: 'https://github.test/app.exe',
        targetPath: '/downloads/app.exe',
      }),
    ).rejects.toThrow('the connection dropped');

    expect(written.size).toBe(0);
  });

  it('reports the status when GitHub refuses the asset', async () => {
    const { files } = memory();

    await expect(
      new Downloader(serve([], { status: 404 }), files).fetchTo({
        url: 'https://github.test/app.exe',
        targetPath: '/downloads/app.exe',
      }),
    ).rejects.toThrow('answered 404');
  });
});
