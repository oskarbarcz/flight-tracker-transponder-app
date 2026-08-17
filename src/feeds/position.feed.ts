import {
  type AdsbClient,
  AdsbReportRejectedError,
  AdsbTokenRejectedError,
} from '../adsb/adsb.client';
import { normalizeCallsign } from '../domain/callsign';
import type { PositionQueue } from '../domain/position-queue';
import {
  decodeSquawk,
  isPublishable,
  type PositionReport,
  toPositionReport,
} from '../domain/position-report';
import type { RatePolicy } from '../domain/rate-policy';
import type { SimSample } from '../domain/sim-sample';
import type { Logger } from '../core/logger';
import type { ConnectionState, StatusRegistry } from '../core/status';
import { describeError } from '../core/supervisor';

export const INITIAL_RETRY_DELAY_MS = 1_000;
export const MAX_RETRY_DELAY_MS = 30_000;

type Outcome = 'published' | 'rejected' | 'retry';

export class PositionFeed {
  private callsign: string | null | undefined = undefined;
  private transmitting = true;
  private publishing = false;
  private retryDelayMs = INITIAL_RETRY_DELAY_MS;
  private retryNotBefore = 0;
  private lastRejection: string | null = null;

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
    this.reportState();
    this.logger.info(
      normalized === null
        ? 'no current flight, publishing suspended'
        : `publishing as ${normalized}`,
    );
  }

  setTransmitting(transmitting: boolean): void {
    if (transmitting === this.transmitting) {
      return;
    }

    this.transmitting = transmitting;
    this.status.setTransmitting(transmitting);
    this.policy.reset();

    if (!transmitting) {
      this.queue.clear();
    }

    this.reportState();
    this.logger.info(
      transmitting
        ? 'transmitting: position reports are being published again'
        : 'standby: position reports are held back until transmission is switched on',
    );
  }

  get isTransmitting(): boolean {
    return this.transmitting;
  }

  accept(sample: SimSample): void {
    this.status.setTransponder(
      decodeSquawk(sample.transponderCodeBcd) ?? null,
      Number.isFinite(sample.groundSpeed) ? sample.groundSpeed : null,
    );

    if (!this.transmitting) {
      return;
    }

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
    if (
      !this.transmitting ||
      this.publishing ||
      this.now() < this.retryNotBefore
    ) {
      return;
    }

    this.publishing = true;

    try {
      while (this.queue.size > 0) {
        const report = this.queue.peek();

        if (report === undefined) {
          return;
        }

        const outcome = await this.publish(report);

        if (outcome === 'retry') {
          return;
        }

        if (outcome === 'rejected') {
          this.queue.discard();
          this.status.setDroppedCount(this.queue.droppedCount);

          continue;
        }

        this.queue.acknowledge();
      }
    } finally {
      this.publishing = false;
    }
  }

  private reportState(): void {
    this.status.set('adsb', this.adsbState());
  }

  private adsbState(): ConnectionState {
    if (!this.transmitting) {
      return 'standby';
    }

    return this.callsign === null || this.callsign === undefined
      ? 'waiting-for-flight'
      : 'connected';
  }

  private holdOffRetrying(): void {
    this.retryNotBefore = this.now() + this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, MAX_RETRY_DELAY_MS);
  }

  private async publish(report: PositionReport): Promise<Outcome> {
    try {
      await this.adsb.publish(report);
      this.status.set('adsb', 'connected');
      this.status.setFault('adsb', null);
      this.status.recordAcceptedReport(new Date(report.date));
      this.retryDelayMs = INITIAL_RETRY_DELAY_MS;
      this.retryNotBefore = 0;
      this.lastRejection = null;

      return 'published';
    } catch (error) {
      if (error instanceof AdsbTokenRejectedError) {
        this.holdOffRetrying();
        this.status.set('adsb', 'unauthorised');
        this.status.setFault(
          'adsb',
          'the ADS-B client token was rejected; nothing is being published',
        );
        this.logger.error('ADS-B service rejected the client token');

        return 'retry';
      }

      if (error instanceof AdsbReportRejectedError) {
        this.status.setFault('adsb', error.message);
        this.noteRejection(error.message);

        return 'rejected';
      }

      this.holdOffRetrying();
      this.status.set('adsb', 'disconnected');
      this.status.setFault(
        'adsb',
        `${describeError(error)} (retrying in ${this.retryDelayMs}ms)`,
      );
      this.logger.warn(
        `publish failed, retrying in ${this.retryDelayMs}ms: ${describeError(error)}`,
      );

      return 'retry';
    }
  }

  private noteRejection(message: string): void {
    if (message === this.lastRejection) {
      this.logger.debug(message);

      return;
    }

    this.lastRejection = message;
    this.logger.error(`${message} — the report was dropped, not retried`);
  }
}
