// One report every ten seconds, counted in samples because SimConnect is
// polled at 1 Hz. The simulator is still read every second so that a takeoff or
// a touchdown is noticed within one, and published on the spot: the cadence is
// what gets thinned out, not the precision of the two edges that matter.
//
// It used to be one report a second airborne and one in five on the ground.
// That was far finer than anything downstream reads — the API polls at one and
// five minute intervals and deduplicates by timestamp — so this is a tenth of
// the traffic for a track nobody can tell apart.
export const PUBLISH_INTERVAL_TICKS = 10;

export class RatePolicy {
  private ticksSincePublish = Number.POSITIVE_INFINITY;
  private lastOnGround: boolean | null = null;

  // The interval is a parameter only so that a test about something else — the
  // queue, a retry, a refusal — can say "every sample publishes" instead of
  // quietly depending on whatever the cadence happens to be. Nothing in the
  // app passes it.
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
