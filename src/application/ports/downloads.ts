export type Progress = (
  receivedBytes: number,
  totalBytes: number | null,
) => void;

export type DownloadRequest = {
  url: string;
  targetPath: string;
  expectedBytes?: number | null;
  digest?: string | null;
  onProgress?: Progress;
};

export interface Downloader {
  fetchTo(request: DownloadRequest): Promise<void>;
}

export type DownloadArea = {
  directory(): Promise<string>;
  ensureWritable(directory: string): boolean;
  uniquePath(directory: string, fileName: string): string;
};
