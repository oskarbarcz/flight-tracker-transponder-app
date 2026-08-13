import {
  type DiscordPresencePayload,
  type FlightTrackerClient,
  NotSignedInError,
  SessionExpiredError,
} from '../api/flight-tracker.client';
import {
  type PresenceWriter,
  toDiscordActivity,
} from '../discord/presence.writer';
import type { Logger } from '../core/logger';
import type { StatusRegistry } from '../core/status';
import { describeError } from '../core/supervisor';

export class PresenceFeed {
  private lastPublished: string | null = null;

  constructor(
    private readonly api: FlightTrackerClient,
    private readonly writer: PresenceWriter,
    private readonly status: StatusRegistry,
    private readonly logger: Logger,
  ) {}

  async tick(): Promise<void> {
    let payload: DiscordPresencePayload | null;

    try {
      payload = await this.api.getDiscordPresence();
      this.status.set('api', 'connected');
    } catch (error) {
      if (
        error instanceof SessionExpiredError ||
        error instanceof NotSignedInError
      ) {
        this.status.set('api', 'unauthorised');
        await this.clear();
        return;
      }

      this.status.set('api', 'disconnected');
      this.logger.warn(`presence poll failed: ${describeError(error)}`);
      return;
    }

    if (payload === null) {
      await this.clear();
      return;
    }

    const activity = toDiscordActivity(payload);
    const fingerprint = JSON.stringify(activity);

    if (fingerprint === this.lastPublished) {
      return;
    }

    await this.writer.setActivity(activity);
    this.lastPublished = fingerprint;
    this.logger.info(`activity published: ${activity.state}`);
  }

  async clear(): Promise<void> {
    if (this.lastPublished === null) {
      return;
    }

    await this.writer.clearActivity();
    this.lastPublished = null;
    this.logger.info('activity cleared');
  }

  forgetPublishedState(): void {
    this.lastPublished = null;
  }
}
