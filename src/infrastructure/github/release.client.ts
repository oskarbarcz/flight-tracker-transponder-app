import type { Release, ReleaseAsset } from '../../domain/release';

const REQUEST_TIMEOUT_MS = 10_000;

export const RELEASES_URL =
  'https://api.github.com/repos/mypreflight/transponder-app/releases/latest';

export const EXECUTABLE_NAME = 'mypreflight-transponder.exe';

export const USER_AGENT = 'flight-tracker-transponder';

type GithubAsset = {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
  digest?: unknown;
};

type GithubRelease = {
  tag_name?: unknown;
  html_url?: unknown;
  assets?: unknown;
};

export class ReleaseClient {
  constructor(
    private readonly url: string = RELEASES_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async latest(): Promise<Release> {
    const response = await this.fetchImpl(this.url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(
        `GitHub answered ${response.status} for the latest release`,
      );
    }

    const release = (await response.json()) as GithubRelease;

    if (typeof release.tag_name !== 'string' || release.tag_name === '') {
      throw new Error('the latest release has no tag');
    }

    return {
      version: release.tag_name.replace(/^v/, ''),
      pageUrl: typeof release.html_url === 'string' ? release.html_url : null,
      asset: executable(release.assets),
    };
  }
}

function executable(assets: unknown): ReleaseAsset | null {
  if (!Array.isArray(assets)) {
    return null;
  }

  const executables = assets
    .map((asset) => describeAsset(asset as GithubAsset))
    .filter((asset): asset is ReleaseAsset => asset !== null)
    .filter((asset) => asset.name.toLowerCase().endsWith('.exe'));

  return (
    executables.find((asset) => asset.name === EXECUTABLE_NAME) ??
    executables[0] ??
    null
  );
}

function describeAsset(asset: GithubAsset): ReleaseAsset | null {
  if (
    typeof asset.name !== 'string' ||
    typeof asset.browser_download_url !== 'string'
  ) {
    return null;
  }

  return {
    name: asset.name,
    url: asset.browser_download_url,
    sizeBytes:
      typeof asset.size === 'number' && asset.size > 0 ? asset.size : null,
    digest: typeof asset.digest === 'string' ? asset.digest : null,
  };
}
