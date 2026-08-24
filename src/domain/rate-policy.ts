export const PUBLISH_INTERVAL_TICKS = 10;

export const HIGH_LEVEL_PUBLISH_INTERVAL_TICKS = 30;

export const HIGH_LEVEL_FT = 10_000;

export class RatePolicy {
  private ticksSincePublish = Number.POSITIVE_INFINITY;
  private lastOnGround: boolean | null = null;

  constructor(
    private readonly intervalTicks: number = PUBLISH_INTERVAL_TICKS,
    private readonly highLevelIntervalTicks: number = HIGH_LEVEL_PUBLISH_INTERVAL_TICKS,
    private readonly highLevelFt: number = HIGH_LEVEL_FT,
  ) {}

  shouldPublish(isOnGround: boolean, altitudeFt = 0): boolean {
    const isTransition =
      this.lastOnGround !== null && this.lastOnGround !== isOnGround;

    this.ticksSincePublish += 1;
    this.lastOnGround = isOnGround;

    if (isTransition) {
      this.ticksSincePublish = 0;
      return true;
    }

    if (this.ticksSincePublish >= this.intervalFor(altitudeFt)) {
      this.ticksSincePublish = 0;
      return true;
    }

    return false;
  }

  reset(): void {
    this.ticksSincePublish = Number.POSITIVE_INFINITY;
    this.lastOnGround = null;
  }

  private intervalFor(altitudeFt: number): number {
    return Number.isFinite(altitudeFt) && altitudeFt > this.highLevelFt
      ? this.highLevelIntervalTicks
      : this.intervalTicks;
  }
}
