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

  get size(): number {
    return this.reports.length;
  }

  get droppedCount(): number {
    return this.dropped;
  }
}
