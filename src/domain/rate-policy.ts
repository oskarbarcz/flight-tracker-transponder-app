export const PUBLISH_INTERVAL_TICKS = 10;

export class RatePolicy {
  private ticksSincePublish = Number.POSITIVE_INFINITY;
  private lastOnGround: boolean | null = null;

  constructor(
    private readonly intervalTicks: number = PUBLISH_INTERVAL_TICKS,
  ) {}

  shouldPublish(isOnGround: boolean): boolean {
    const isTransition =
      this.lastOnGround !== null && this.lastOnGround !== isOnGround;

    this.ticksSincePublish += 1;
    this.lastOnGround = isOnGround;

    if (isTransition) {
      this.ticksSincePublish = 0;
      return true;
    }

    if (this.ticksSincePublish >= this.intervalTicks) {
      this.ticksSincePublish = 0;
      return true;
    }

    return false;
  }

  reset(): void {
    this.ticksSincePublish = Number.POSITIVE_INFINITY;
    this.lastOnGround = null;
  }
}
