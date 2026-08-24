import { extname } from 'node:path';

export type ReleaseAsset = {
  name: string;
  url: string;
  sizeBytes: number | null;
  digest: string | null;
};

export type Release = {
  version: string;
  pageUrl: string | null;
  asset: ReleaseAsset | null;
};

export function versionedName(assetName: string, version: string): string {
  const extension = extname(assetName);
  const stem = assetName.slice(0, assetName.length - extension.length);

  return `${stem}-${version}${extension}`;
}

export function isUpdateAvailable(
  running: string,
  latest: string | null,
): boolean {
  if (latest === null) {
    return false;
  }

  const here = parseVersion(running);
  const there = parseVersion(latest);

  if (here === null || there === null) {
    return false;
  }

  for (let part = 0; part < 3; part += 1) {
    const mine = here[part] ?? 0;
    const theirs = there[part] ?? 0;

    if (mine !== theirs) {
      return theirs > mine;
    }
  }

  return false;
}
function parseVersion(version: string): number[] | null {
  const parts = version.trim().replace(/^v/, '').split('.');

  if (parts.length === 0 || parts.length > 3) {
    return null;
  }

  const numbers = parts.map((part) => Number.parseInt(part, 10));

  return numbers.every((part) => Number.isInteger(part) && part >= 0)
    ? numbers
    : null;
}
