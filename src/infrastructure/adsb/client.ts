import type { PositionReport } from '../../domain/position-report';
import {
  PositionPublishFailedError,
  type PositionPublisher,
  PositionRejectedError,
  PublisherUnauthorisedError,
} from '../../application/ports/positions';

const REQUEST_TIMEOUT_MS = 7_000;

const MAX_DETAIL_LENGTH = 400;

const TRANSIENT_STATUSES = [408, 429];

export class AdsbClient implements PositionPublisher {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async verifyToken(): Promise<void> {
    const response = await this.request('/api/v1/auth-check/client', 'POST');

    if (response.status === 401 || response.status === 403) {
      throw new PublisherUnauthorisedError();
    }

    if (!response.ok) {
      throw new PositionPublishFailedError(
        response.status,
        await detailOf(response),
      );
    }
  }

  async version(): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `the ADS-B service answered ${response.status} to its status endpoint`,
      );
    }

    return versionOf((await response.json()) as { version?: unknown });
  }

  async publish(report: PositionReport): Promise<void> {
    const response = await this.request('/api/v1/position', 'POST', report);

    if (response.ok) {
      return;
    }

    if (response.status === 401 || response.status === 403) {
      throw new PublisherUnauthorisedError();
    }

    const detail = await detailOf(response);

    if (isPermanent(response.status)) {
      throw new PositionRejectedError(response.status, detail);
    }

    throw new PositionPublishFailedError(response.status, detail);
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

async function detailOf(response: Response): Promise<string> {
  try {
    const body = await response.text();

    return body.replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL_LENGTH);
  } catch {
    return '';
  }
}

function versionOf(body: { version?: unknown }): string {
  if (typeof body.version !== 'string' || body.version === '') {
    throw new Error('the ADS-B service reported no version');
  }

  return body.version;
}
