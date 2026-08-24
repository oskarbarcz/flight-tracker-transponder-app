import { type Release, versionedName } from '../domain/release';
import type { DownloadArea, Downloader } from './ports/downloads';
import type { StatusRegistry } from './status';
import { describeError } from './supervisor';

export type UpdateLogger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export class Updater {
  private busy = false;

  constructor(
    private readonly downloader: Downloader,
    private readonly status: StatusRegistry,
    private readonly logger: UpdateLogger,
    private readonly area: DownloadArea,
  ) {}

  get running(): boolean {
    return this.busy;
  }

  async download(release: Release): Promise<string | null> {
    if (this.busy) {
      this.logger.warn('the update is already downloading');

      return null;
    }

    const asset = release.asset;

    if (asset === null) {
      this.fail(
        `release v${release.version} carries no Windows executable` +
          (release.pageUrl === null ? '' : `; see ${release.pageUrl}`),
      );

      return null;
    }

    this.busy = true;
    this.status.setUpdate({
      phase: 'downloading',
      receivedBytes: 0,
      totalBytes: asset.sizeBytes,
    });

    try {
      const directory = await this.area.directory();

      if (!this.area.ensureWritable(directory)) {
        this.fail(`${directory} cannot be written to`);

        return null;
      }

      const target = this.area.uniquePath(
        directory,
        versionedName(asset.name, release.version),
      );

      this.logger.info(`downloading v${release.version} to ${target}`);

      await this.downloader.fetchTo({
        url: asset.url,
        targetPath: target,
        expectedBytes: asset.sizeBytes,
        digest: asset.digest,
        onProgress: (receivedBytes, totalBytes) =>
          this.status.setUpdate({
            phase: 'downloading',
            receivedBytes,
            totalBytes,
          }),
      });

      this.status.setUpdate({ phase: 'saved', path: target });
      this.logger.info(
        `v${release.version} is in ${target}: quit the app and swap the executable for it`,
      );

      return target;
    } catch (error) {
      this.fail(describeError(error));

      return null;
    } finally {
      this.busy = false;
    }
  }

  private fail(reason: string): void {
    this.status.setUpdate({ phase: 'failed', reason });
    this.logger.error(`the update download failed: ${reason}`);
  }
}
