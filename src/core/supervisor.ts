import type { Logger } from './logger';

export type SupervisedLoop = {
  name: string;
  run: (signal: AbortSignal) => Promise<void>;
};

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

export function nextBackoff(current: number): number {
  return Math.min(current * 2, MAX_BACKOFF_MS);
}

export class Supervisor {
  private readonly controller = new AbortController();
  private readonly running: Promise<void>[] = [];

  constructor(
    private readonly logger: Logger,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  start(loop: SupervisedLoop): void {
    this.running.push(this.supervise(loop));
  }

  async stop(): Promise<void> {
    this.controller.abort();
    await Promise.allSettled(this.running);
  }

  private async supervise(loop: SupervisedLoop): Promise<void> {
    const logger = this.logger.child(loop.name);
    let backoff = INITIAL_BACKOFF_MS;

    while (!this.controller.signal.aborted) {
      try {
        await loop.run(this.controller.signal);
        backoff = INITIAL_BACKOFF_MS;
      } catch (error) {
        logger.warn(`loop failed, restarting: ${describeError(error)}`);
      }

      if (this.controller.signal.aborted) {
        return;
      }

      await this.sleep(backoff);
      backoff = nextBackoff(backoff);
    }
  }
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
