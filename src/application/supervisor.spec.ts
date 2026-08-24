import { Logger } from '../infrastructure/logger';
import { nextBackoff, Supervisor } from './supervisor';

function silentLogger(): Logger {
  return new Logger('error', '/dev/null');
}

function yieldingSleep(): () => Promise<void> {
  return () => new Promise((resolve) => setImmediate(resolve));
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe('nextBackoff', () => {
  it('doubles until it reaches the ceiling', () => {
    expect(nextBackoff(1_000)).toBe(2_000);
    expect(nextBackoff(32_000)).toBe(60_000);
    expect(nextBackoff(60_000)).toBe(60_000);
  });
});

describe('Supervisor', () => {
  it('restarts a loop that throws', async () => {
    const supervisor = new Supervisor(silentLogger(), yieldingSleep());
    const thirdAttempt = deferred();
    let attempts = 0;

    supervisor.start({
      name: 'flaky',
      run: () => {
        attempts += 1;

        if (attempts < 3) {
          return Promise.reject(new Error('boom'));
        }

        thirdAttempt.resolve();

        return Promise.resolve();
      },
    });

    await thirdAttempt.promise;
    await supervisor.stop();

    expect(attempts).toBe(3);
  });

  it('keeps one failing loop from stopping another', async () => {
    const supervisor = new Supervisor(silentLogger(), yieldingSleep());
    const healthyRan = deferred();
    let healthyRuns = 0;
    let failingRuns = 0;

    supervisor.start({
      name: 'failing',
      run: () => {
        failingRuns += 1;

        return Promise.reject(new Error('always'));
      },
    });

    supervisor.start({
      name: 'healthy',
      run: () => {
        healthyRuns += 1;

        if (healthyRuns === 3) {
          healthyRan.resolve();
        }

        return Promise.resolve();
      },
    });

    await healthyRan.promise;
    await supervisor.stop();

    expect(healthyRuns).toBe(3);
    expect(failingRuns).toBeGreaterThan(0);
  });

  it('stops looping once aborted', async () => {
    const supervisor = new Supervisor(silentLogger(), yieldingSleep());
    const started = deferred();
    let runs = 0;

    supervisor.start({
      name: 'counting',
      run: () => {
        runs += 1;
        started.resolve();

        return Promise.resolve();
      },
    });

    await started.promise;
    await supervisor.stop();
    const runsAtStop = runs;

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(runs).toBe(runsAtStop);
  });

  it('passes the abort signal to the loop', async () => {
    const supervisor = new Supervisor(silentLogger(), yieldingSleep());
    const observed = deferred();
    const captured: { signal: AbortSignal | null } = { signal: null };

    supervisor.start({
      name: 'signal',
      run: (abortSignal) => {
        captured.signal = abortSignal;
        observed.resolve();

        return Promise.resolve();
      },
    });

    await observed.promise;
    await supervisor.stop();

    expect(captured.signal?.aborted).toBe(true);
  });
});
