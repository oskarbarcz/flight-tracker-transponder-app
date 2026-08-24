import {
  HIGH_LEVEL_FT,
  HIGH_LEVEL_PUBLISH_INTERVAL_TICKS,
  PUBLISH_INTERVAL_TICKS,
  RatePolicy,
} from './rate-policy';

function run(
  policy: RatePolicy,
  onGround: boolean,
  ticks: number,
  altitudeFt = 0,
): number {
  let published = 0;

  for (let tick = 0; tick < ticks; tick += 1) {
    if (policy.shouldPublish(onGround, altitudeFt)) {
      published += 1;
    }
  }

  return published;
}

describe('RatePolicy', () => {
  it('publishes once every ten seconds at the 1 Hz sample rate', () => {
    expect(PUBLISH_INTERVAL_TICKS).toBe(10);
    expect(run(new RatePolicy(), false, 60)).toBe(6);
  });

  it('holds the same cadence on the ground', () => {
    expect(run(new RatePolicy(), true, 60)).toBe(6);
  });

  it('publishes the first sample it ever sees', () => {
    expect(new RatePolicy().shouldPublish(true)).toBe(true);
  });

  it('publishes lift-off on the tick it happens', () => {
    const policy = new RatePolicy();
    run(policy, true, 3);

    expect(policy.shouldPublish(false)).toBe(true);
  });

  it('publishes touchdown on the tick it happens', () => {
    const policy = new RatePolicy();
    policy.shouldPublish(false);

    expect(policy.shouldPublish(true)).toBe(true);
  });

  it('does not let a transition reset the cadence early', () => {
    const policy = new RatePolicy();
    policy.shouldPublish(false);
    expect(policy.shouldPublish(true)).toBe(true);

    expect(run(policy, true, PUBLISH_INTERVAL_TICKS - 1)).toBe(0);
    expect(policy.shouldPublish(true)).toBe(true);
  });

  it('publishes once every thirty seconds above ten thousand feet', () => {
    expect(HIGH_LEVEL_PUBLISH_INTERVAL_TICKS).toBe(30);
    expect(HIGH_LEVEL_FT).toBe(10_000);
    expect(run(new RatePolicy(), false, 180, 35_000)).toBe(6);
  });

  it('holds the ten-second cadence at ten thousand feet exactly', () => {
    expect(run(new RatePolicy(), false, 60, HIGH_LEVEL_FT)).toBe(6);
  });

  it('goes back to ten seconds on the way down', () => {
    const policy = new RatePolicy();
    run(policy, false, 60, 35_000);

    expect(run(policy, false, 60, 9_000)).toBe(6);
  });

  it('publishes on the first tick back below ten thousand feet', () => {
    const policy = new RatePolicy();
    policy.shouldPublish(false, 35_000);
    run(policy, false, 14, 35_000);

    expect(policy.shouldPublish(false, 9_500)).toBe(true);
  });

  it('still publishes both edges at high level', () => {
    const policy = new RatePolicy();
    policy.shouldPublish(true, 12_000);

    expect(policy.shouldPublish(false, 12_000)).toBe(true);
  });

  it('reads an altitude the simulator could not supply as low level', () => {
    expect(run(new RatePolicy(), false, 60, Number.NaN)).toBe(6);
  });

  it('starts over after a reset', () => {
    const policy = new RatePolicy();
    run(policy, true, 3);
    policy.reset();

    expect(policy.shouldPublish(true)).toBe(true);
  });
});
