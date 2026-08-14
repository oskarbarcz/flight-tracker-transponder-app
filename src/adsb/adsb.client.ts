import type { PositionReport } from '../domain/position-report';

const REQUEST_TIMEOUT_MS = 7_000;

// Enough of the service's answer to name the field it objected to, which is
// the whole reason for reading the body at all. A validation error lists one
// message per field, so this is generous rather than tight.
const MAX_DETAIL_LENGTH = 400;

// The two 4xx codes that say "later", not "never".
const TRANSIENT_STATUSES = [408, 429];

export class AdsbTokenRejectedError extends Error {
  constructor() {
    super('The ADS-B service rejected the client token.');
  }
}

// The service will not accept this report however many times it is offered —
// a malformed payload, an unacceptable callsign. Retrying is pointless and
// actively harmful, since the report sits at the head of the queue.
export class AdsbReportRejectedError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(
      `The ADS-B service rejected a position report with ${status}${suffix(detail)}`,
    );
  }
}

// Something that may work on the next attempt: the service is down, slow, or
// asking us to come back later.
export class AdsbPublishFailedError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string = '',
  ) {
    super(
      `The ADS-B service answered ${status} to a position report${suffix(detail)}`,
    );
  }
}

export class AdsbClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async verifyToken(): Promise<void> {
    const response = await this.request('/api/v1/auth-check/client', 'POST');

    if (response.status === 401 || response.status === 403) {
      throw new AdsbTokenRejectedError();
    }

    if (!response.ok) {
      throw new AdsbPublishFailedError(
        response.status,
        await detailOf(response),
      );
    }
  }

  async publish(report: PositionReport): Promise<void> {
    const response = await this.request('/api/v1/position', 'POST', report);

    if (response.ok) {
      return;
    }

    if (response.status === 401 || response.status === 403) {
      throw new AdsbTokenRejectedError();
    }

    const detail = await detailOf(response);

    if (isPermanent(response.status)) {
      throw new AdsbReportRejectedError(response.status, detail);
    }

    throw new AdsbPublishFailedError(response.status, detail);
  }

  private async request(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
}

function isPermanent(status: number): boolean {
  return status >= 400 && status < 500 && !TRANSIENT_STATUSES.includes(status);
}

// A 400 whose body nobody reads is a bug report with the evidence torn off:
// the service names the field it refused, and that name is the difference
// between a five-minute fix and a guess.
async function detailOf(response: Response): Promise<string> {
  try {
    const body = await response.text();

    return body.replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL_LENGTH);
  } catch {
    return '';
  }
}

function suffix(detail: string): string {
  return detail === '' ? '.' : `: ${detail}`;
}
