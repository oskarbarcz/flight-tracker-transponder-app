import type { PositionReport } from '../../domain/position-report';

export interface PositionPublisher {
  publish(report: PositionReport): Promise<void>;
}

export class PublisherUnauthorisedError extends Error {
  constructor() {
    super('The ADS-B service rejected the client token.');
  }
}

export class PositionRejectedError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(
      `The ADS-B service rejected a position report with ${status}${suffix(detail)}`,
    );
  }
}

export class PositionPublishFailedError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string = '',
  ) {
    super(
      `The ADS-B service answered ${status} to a position report${suffix(detail)}`,
    );
  }
}

function suffix(detail: string): string {
  return detail === '' ? '.' : `: ${detail}`;
}
