import type { PositionReport } from '../domain/position-report';

const REQUEST_TIMEOUT_MS = 7_000;

export class AdsbTokenRejectedError extends Error {
  constructor() {
    super('The ADS-B service rejected the client token.');
  }
}

export class AdsbPublishFailedError extends Error {
  constructor(status: number) {
    super(`The ADS-B service answered ${status} to a position report.`);
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
      throw new AdsbPublishFailedError(response.status);
    }
  }

  async publish(report: PositionReport): Promise<void> {
    const response = await this.request('/api/v1/position', 'POST', report);

    if (response.status === 401 || response.status === 403) {
      throw new AdsbTokenRejectedError();
    }

    if (!response.ok) {
      throw new AdsbPublishFailedError(response.status);
    }
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
