import type {
  Presence,
  PresenceSource,
  PresenceWriter,
} from './ports/presence';
import { NotSignedInError, SessionExpiredError } from './ports/session';
import type { Logger } from './ports/logger';
import type { StatusRegistry } from './status';
import { describeError } from './supervisor';

export class PresenceFeed {
  private lastPublished: string | null = null;

  constructor(
    private readonly api: PresenceSource,
    private readonly writer: PresenceWriter,
    private readonly status: StatusRegistry,
    private readonly logger: Logger,
  ) {}

  async tick(): Promise<void> {
    let payload: Presence | null;

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

    const fingerprint = JSON.stringify(payload);

    if (fingerprint === this.lastPublished) {
      return;
    }

    await this.writer.setActivity(payload);
    this.lastPublished = fingerprint;
    this.status.setPresence(payload.state, payload.details);
    this.logger.info(`activity published: ${payload.state}`);
  }

  async clear(): Promise<void> {
    if (this.lastPublished === null) {
      return;
    }

    await this.writer.clearActivity();
    this.lastPublished = null;
    this.status.setPresence(null, null);
    this.logger.info('activity cleared');
  }

  forgetPublishedState(): void {
    this.lastPublished = null;
  }
}
