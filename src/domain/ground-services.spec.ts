import {
  type GroundService,
  type ServiceId,
  type ServiceState,
  isRunning,
  isWorthShowing,
  SERVICE_IDS,
  serviceIdOf,
  serviceStateOf,
  Turnaround,
} from './ground-services';

function service(id: ServiceId, state: ServiceState | null): GroundService {
  return {
    id,
    state,
    phase: null,
    operator: null,
    passengers: null,
    bagsPercent: null,
    cargo: [],
    fuel: null,
  };
}

describe('the service vocabulary', () => {
  it('names every service GSX publishes', () => {
    expect(Object.keys(SERVICE_IDS).sort()).toEqual([
      'Boarding',
      'Catering',
      'Cleaning',
      'DeIce',
      'Deboarding',
      'Departure',
      'GPU',
      'Lavatory',
      'OperateJetways',
      'OperateStairs',
      'Refueling',
      'Water',
    ]);
  });

  it('reads GSX names into the app own vocabulary', () => {
    expect(serviceIdOf('Departure')).toBe('pushback');
    expect(serviceIdOf('OperateJetways')).toBe('jetway');
    expect(serviceIdOf('DeIce')).toBe('deicing');
  });

  it('refuses a service it does not know rather than guessing', () => {
    expect(serviceIdOf('SomethingNew')).toBeNull();
    expect(serviceIdOf(7)).toBeNull();
    expect(serviceIdOf(undefined)).toBeNull();
  });

  it('reads the states GSX publishes', () => {
    expect(serviceStateOf('available')).toBe('requestable');
    expect(serviceStateOf('performing')).toBe('performing');
    expect(serviceStateOf('completed')).toBe('completed');
    expect(serviceStateOf('bypassed')).toBe('bypassed');
  });

  it('leaves a state it does not know unstated', () => {
    expect(serviceStateOf('dawdling')).toBeNull();
  });
});

describe('isRunning and isWorthShowing', () => {
  it('counts a requested or performing service as running', () => {
    expect(isRunning(service('boarding', 'performing'))).toBe(true);
    expect(isRunning(service('boarding', 'requested'))).toBe(true);
    expect(isRunning(service('boarding', 'completed'))).toBe(false);
  });

  it('shows anything but a service that has merely been offered', () => {
    expect(isWorthShowing(service('gpu', 'requestable'))).toBe(false);
    expect(isWorthShowing(service('gpu', null))).toBe(false);
    expect(isWorthShowing(service('gpu', 'completed'))).toBe(true);
  });
});

describe('Turnaround', () => {
  it('reports what GSX reports while nothing has finished', () => {
    const turnaround = new Turnaround();

    turnaround.accept([service('boarding', 'performing')]);

    expect(turnaround.snapshot()).toEqual([service('boarding', 'performing')]);
  });

  it('keeps a completed service completed when GSX offers it again', () => {
    const turnaround = new Turnaround();

    turnaround.accept([service('boarding', 'performing')]);
    turnaround.accept([service('boarding', 'completed')]);
    turnaround.accept([service('boarding', 'requestable')]);

    expect(turnaround.snapshot()[0]?.state).toBe('completed');
  });

  it('lets a completed service start again rather than pinning it', () => {
    const turnaround = new Turnaround();

    turnaround.accept([service('catering', 'completed')]);
    turnaround.accept([service('catering', 'performing')]);

    expect(turnaround.snapshot()[0]?.state).toBe('performing');
  });

  it('does not promote a service that never completed', () => {
    const turnaround = new Turnaround();

    turnaround.accept([service('gpu', 'performing')]);
    turnaround.accept([service('gpu', 'requestable')]);

    expect(turnaround.snapshot()[0]?.state).toBe('requestable');
  });

  it('forgets everything when the turnaround is over', () => {
    const turnaround = new Turnaround();

    turnaround.accept([service('boarding', 'completed')]);
    turnaround.reset();
    turnaround.accept([service('boarding', 'requestable')]);

    expect(turnaround.snapshot()[0]?.state).toBe('requestable');
  });

  it('drops a service GSX has stopped publishing rather than remembering it', () => {
    const turnaround = new Turnaround();

    turnaround.accept([
      service('boarding', 'performing'),
      service('catering', 'performing'),
    ]);
    turnaround.accept([service('boarding', 'performing')]);

    expect(turnaround.snapshot().map((entry) => entry.id)).toEqual([
      'boarding',
    ]);
  });

  it('reports only what is under way', () => {
    const turnaround = new Turnaround();

    turnaround.accept([
      service('boarding', 'performing'),
      service('gpu', 'requestable'),
      service('jetway', 'completed'),
    ]);

    expect(turnaround.running().map((entry) => entry.id)).toEqual(['boarding']);
  });

  it('ignores a service whose state it could not read when settling completion', () => {
    const turnaround = new Turnaround();

    turnaround.accept([service('boarding', 'completed')]);
    turnaround.accept([service('boarding', null)]);

    expect(turnaround.snapshot()[0]?.state).toBeNull();
  });
});
