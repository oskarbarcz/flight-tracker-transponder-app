import { PUBLISH_INTERVAL_TICKS, RatePolicy } from './rate-policy';

function run(policy: RatePolicy, onGround: boolean, ticks: number): number {
  let published = 0;

  for (let tick = 0; tick < ticks; tick += 1) {
    if (policy.shouldPublish(onGround)) {
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

  it('starts over after a reset', () => {
    const policy = new RatePolicy();
    run(policy, true, 3);
    policy.reset();

    expect(policy.shouldPublish(true)).toBe(true);
  });
});
