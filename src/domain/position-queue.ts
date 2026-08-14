import type { PositionReport } from './position-report';

export const DEFAULT_QUEUE_CAPACITY = 3600;

export class PositionQueue {
  private readonly reports: PositionReport[] = [];
  private dropped = 0;

  constructor(private readonly capacity: number = DEFAULT_QUEUE_CAPACITY) {}

  add(report: PositionReport): void {
    this.reports.push(report);

    while (this.reports.length > this.capacity) {
      this.reports.shift();
      this.dropped += 1;
    }
  }

  peek(): PositionReport | undefined {
    return this.reports[0];
  }

  acknowledge(): void {
    this.reports.shift();
  }

  // For the head report the service will never accept: it leaves the queue
  // counted as dropped, because it is a report that wanted to be published and
  // never will be. Retrying it instead blocks every report queued behind it.
  discard(): void {
    if (this.reports.shift() !== undefined) {
      this.dropped += 1;
    }
  }

  // A deliberate standby is not an outage, so what it abandons is not counted:
  // nobody asked for these to be published.
  clear(): void {
    this.reports.length = 0;
  }

  get size(): number {
    return this.reports.length;
  }

  get droppedCount(): number {
    return this.dropped;
  }
}
