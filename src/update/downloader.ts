import { createHash } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import { USER_AGENT } from '../api/release.client';

const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

const PARTIAL_SUFFIX = '.part';

export type Progress = (
  receivedBytes: number,
  totalBytes: number | null,
) => void;

export type FileWriter = {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
};

export type FileSystem = {
  create(path: string): Promise<FileWriter>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
};

export const realFileSystem: FileSystem = {
  create: async (path) => {
    const handle = await open(path, 'w');

    return {
      write: async (chunk) => {
        await handle.write(chunk);
      },
      close: () => handle.close(),
    };
  },
  move: (from, to) => rename(from, to),
  remove: (path) => rm(path, { force: true }),
};

export type DownloadRequest = {
  url: string;
  targetPath: string;
  expectedBytes?: number | null;
  digest?: string | null;
  onProgress?: Progress;
};

export class Downloader {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly files: FileSystem = realFileSystem,
    private readonly timeoutMs: number = DOWNLOAD_TIMEOUT_MS,
  ) {}

  async fetchTo(request: DownloadRequest): Promise<void> {
    const partial = `${request.targetPath}${PARTIAL_SUFFIX}`;
    const response = await this.fetchImpl(request.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: '*/*', 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`the download answered ${response.status}`);
    }

    if (response.body === null) {
      throw new Error('the download carried no body');
    }

    const total = declaredLength(response) ?? request.expectedBytes ?? null;
    const hash = createHash('sha256');
    const writer = await this.files.create(partial);
    const reader = response.body.getReader();
    let received = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (value === undefined) {
          continue;
        }

        hash.update(value);
        await writer.write(value);
        received += value.byteLength;
        request.onProgress?.(received, total);
      }

      await writer.close();
    } catch (error) {
      await writer.close().catch(() => undefined);
      await this.files.remove(partial);

      throw error;
    }

    const complaint = verify(received, hash.digest('hex'), request);

    if (complaint !== null) {
      await this.files.remove(partial);

      throw new Error(complaint);
    }

    await this.files.move(partial, request.targetPath);
  }
}

function verify(
  received: number,
  actual: string,
  request: DownloadRequest,
): string | null {
  const expectedBytes = request.expectedBytes ?? null;

  if (expectedBytes !== null && received !== expectedBytes) {
    return `the download stopped after ${received} of ${expectedBytes} bytes`;
  }

  const expected = sha256(request.digest ?? null);

  if (expected !== null && expected !== actual) {
    return 'the download does not match the checksum GitHub published';
  }

  return null;
}

function sha256(digest: string | null): string | null {
  const found = /^sha256:([0-9a-f]{64})$/i.exec(digest?.trim() ?? '');

  return found?.[1]?.toLowerCase() ?? null;
}

function declaredLength(response: Response): number | null {
  const header = Number(response.headers.get('content-length'));

  return Number.isFinite(header) && header > 0 ? header : null;
}
