import { type AdsbClient, AdsbTokenRejectedError } from '../adsb/adsb.client';
import { normalizeCallsign } from '../domain/callsign';
import type { PositionQueue } from '../domain/position-queue';
import {
  isPublishable,
  type PositionReport,
  toPositionReport,
} from '../domain/position-report';
import type { RatePolicy } from '../domain/rate-policy';
import type { SimSample } from '../domain/sim-sample';
import type { Logger } from '../core/logger';
import type { StatusRegistry } from '../core/status';
import { describeError } from '../core/supervisor';

export const INITIAL_RETRY_DELAY_MS = 1_000;
export const MAX_RETRY_DELAY_MS = 30_000;

export class PositionFeed {
  private callsign: string | null | undefined = undefined;
  private publishing = false;
  private retryDelayMs = INITIAL_RETRY_DELAY_MS;
  private retryNotBefore = 0;

  constructor(
    private readonly adsb: AdsbClient,
    private readonly queue: PositionQueue,
    private readonly policy: RatePolicy,
    private readonly status: StatusRegistry,
    private readonly logger: Logger,
    private readonly now: () => number = () => Date.now(),
  ) {}

  setCurrentFlightCallsign(callsign: string | null): void {
    const normalized = callsign === null ? null : normalizeCallsign(callsign);

    if (normalized === this.callsign) {
      return;
    }

    this.callsign = normalized;
    this.policy.reset();
    this.status.setCallsign(normalized);
    this.status.set(
      'adsb',
      normalized === null ? 'waiting-for-flight' : 'connected',
    );
    this.logger.info(
      normalized === null
        ? 'no current flight, publishing suspended'
        : `publishing as ${normalized}`,
    );
  }

  accept(sample: SimSample): void {
    if (this.callsign === null || this.callsign === undefined) {
      return;
    }

    if (!this.policy.shouldPublish(sample.isOnGround)) {
      return;
    }

    const report = toPositionReport(sample, this.callsign);

    if (!isPublishable(report)) {
      return;
    }

    this.queue.add(report);
    this.status.setDroppedCount(this.queue.droppedCount);
  }

  async drain(): Promise<void> {
    if (this.publishing || this.now() < this.retryNotBefore) {
      return;
    }

    this.publishing = true;

    try {
      while (this.queue.size > 0) {
        const report = this.queue.peek();

        if (report === undefined) {
          return;
        }

        if (!(await this.publish(report))) {
          return;
        }

        this.queue.acknowledge();
      }
    } finally {
      this.publishing = false;
    }
  }

  private holdOffRetrying(): void {
    this.retryNotBefore = this.now() + this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, MAX_RETRY_DELAY_MS);
  }

  private async publish(report: PositionReport): Promise<boolean> {
    try {
      await this.adsb.publish(report);
      this.status.set('adsb', 'connected');
      this.status.recordAcceptedReport(new Date(report.date));
      this.retryDelayMs = INITIAL_RETRY_DELAY_MS;
      this.retryNotBefore = 0;

      return true;
    } catch (error) {
      this.holdOffRetrying();

      if (error instanceof AdsbTokenRejectedError) {
        this.status.set('adsb', 'unauthorised');
        this.logger.error('ADS-B service rejected the client token');

        return false;
      }

      this.status.set('adsb', 'disconnected');
      this.logger.warn(
        `publish failed, retrying in ${this.retryDelayMs}ms: ${describeError(error)}`,
      );

      return false;
    }
  }
}
