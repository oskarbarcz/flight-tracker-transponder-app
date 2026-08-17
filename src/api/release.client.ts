const REQUEST_TIMEOUT_MS = 10_000;

export const RELEASES_URL =
  'https://api.github.com/repos/oskarbarcz/flight-tracker-transponder-app/releases/latest';

export class ReleaseClient {
  constructor(
    private readonly url: string = RELEASES_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async latest(): Promise<string> {
    const response = await this.fetchImpl(this.url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'flight-tracker-transponder',
      },
    });

    if (!response.ok) {
      throw new Error(
        `GitHub answered ${response.status} for the latest release`,
      );
    }

    const release = (await response.json()) as { tag_name?: unknown };

    if (typeof release.tag_name !== 'string' || release.tag_name === '') {
      throw new Error('the latest release has no tag');
    }

    return release.tag_name.replace(/^v/, '');
  }
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
