export const AIRBORNE_INTERVAL_TICKS = 1;
export const ON_GROUND_INTERVAL_TICKS = 5;

export class RatePolicy {
  private ticksSincePublish = Number.POSITIVE_INFINITY;
  private lastOnGround: boolean | null = null;

  shouldPublish(isOnGround: boolean): boolean {
    const isTransition =
      this.lastOnGround !== null && this.lastOnGround !== isOnGround;

    this.ticksSincePublish += 1;
    this.lastOnGround = isOnGround;

    if (isTransition) {
      this.ticksSincePublish = 0;
      return true;
    }

    const interval = isOnGround
      ? ON_GROUND_INTERVAL_TICKS
      : AIRBORNE_INTERVAL_TICKS;

    if (this.ticksSincePublish >= interval) {
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
