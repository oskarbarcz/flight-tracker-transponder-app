import { RatePolicy } from './rate-policy';

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
  it('publishes every tick while airborne', () => {
    expect(run(new RatePolicy(), false, 60)).toBe(60);
  });

  it('publishes every fifth tick on the ground', () => {
    expect(run(new RatePolicy(), true, 60)).toBe(12);
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

  it('does not let a transition reset the ground cadence early', () => {
    const policy = new RatePolicy();
    policy.shouldPublish(false);
    expect(policy.shouldPublish(true)).toBe(true);

    expect(run(policy, true, 4)).toBe(0);
    expect(policy.shouldPublish(true)).toBe(true);
  });

  it('starts over after a reset', () => {
    const policy = new RatePolicy();
    run(policy, true, 3);
    policy.reset();

    expect(policy.shouldPublish(true)).toBe(true);
  });
});
