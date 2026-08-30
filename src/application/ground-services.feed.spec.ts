import type {
  GroundService,
  ServiceId,
  ServiceState,
} from '../domain/ground-services';
import { GroundServicesFeed } from './ground-services.feed';
import { StatusRegistry } from './status';

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

function feed(): {
  feed: GroundServicesFeed;
  registry: StatusRegistry;
  logs: string[];
} {
  const registry = new StatusRegistry();
  const logs: string[] = [];
  const logger = {
    debug: () => undefined,
    info: (line: string) => logs.push(line),
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  };

  return {
    registry,
    logs,
    feed: new GroundServicesFeed(registry, logger),
  };
}

describe('GroundServicesFeed', () => {
  it('reports nothing at all until GSX is connected', () => {
    const { feed: ground, registry } = feed();

    ground.accept([service('boarding', 'performing')]);

    expect(registry.snapshot().groundHandling).toBe('searching');
    expect(registry.snapshot().groundServices).toEqual([]);
  });

  it('reports what is happening once GSX is connected', () => {
    const { feed: ground, registry } = feed();

    ground.setStatus('connected');
    ground.accept([service('boarding', 'performing')]);

    expect(registry.snapshot().groundServices).toEqual([
      expect.objectContaining({ id: 'boarding', state: 'performing' }),
    ]);
  });

  it('leaves out a service that has only been offered', () => {
    const { feed: ground, registry } = feed();

    ground.setStatus('connected');
    ground.accept([
      service('boarding', 'performing'),
      service('gpu', 'requestable'),
    ]);

    expect(registry.snapshot().groundServices.map((entry) => entry.id)).toEqual(
      ['boarding'],
    );
  });

  it('drops everything it held when GSX goes away', () => {
    const { feed: ground, registry } = feed();

    ground.setStatus('connected');
    ground.accept([service('boarding', 'performing')]);
    ground.setStatus('searching');

    expect(registry.snapshot().groundServices).toEqual([]);
    expect(registry.snapshot().stand).toEqual({
      airport: null,
      parking: null,
    });
  });

  it('reports the stand while connected', () => {
    const { feed: ground, registry } = feed();

    ground.setStatus('connected');
    ground.setStand({ airport: 'KJFK', parking: 'Gate 20A' });

    expect(registry.snapshot().stand).toEqual({
      airport: 'KJFK',
      parking: 'Gate 20A',
    });
  });

  it('keeps a completed service completed when GSX offers it again', () => {
    const { feed: ground, registry } = feed();

    ground.setStatus('connected');
    ground.accept([service('boarding', 'completed')]);
    ground.accept([service('boarding', 'requestable')]);

    expect(registry.snapshot().groundServices).toEqual([
      expect.objectContaining({ id: 'boarding', state: 'completed' }),
    ]);
  });

  it('forgets the turnaround once the aircraft has flown', () => {
    const { feed: ground, registry } = feed();

    ground.setStatus('connected');
    ground.setOnGround(true);
    ground.accept([service('boarding', 'completed')]);
    ground.setOnGround(false);

    expect(registry.snapshot().groundServices).toEqual([]);
  });

  it('forgets the turnaround when the pilot flight changes', () => {
    const { feed: ground, registry } = feed();

    ground.setStatus('connected');
    ground.setCurrentFlight('flight-1');
    ground.accept([service('boarding', 'completed')]);
    ground.setCurrentFlight('flight-2');

    expect(registry.snapshot().groundServices).toEqual([]);
  });

  it('does not forget the turnaround for the same flight reported again', () => {
    const { feed: ground, registry } = feed();

    ground.setStatus('connected');
    ground.setCurrentFlight('flight-1');
    ground.accept([service('boarding', 'completed')]);
    ground.setCurrentFlight('flight-1');

    expect(registry.snapshot().groundServices).toHaveLength(1);
  });

  it('does not forget the turnaround while the aircraft stays on the ground', () => {
    const { feed: ground, registry } = feed();

    ground.setStatus('connected');
    ground.setOnGround(true);
    ground.accept([service('boarding', 'completed')]);
    ground.setOnGround(true);

    expect(registry.snapshot().groundServices).toHaveLength(1);
  });

  it('says once when a service changes state, and not on every sample', () => {
    const { feed: ground, logs } = feed();

    ground.setStatus('connected');
    ground.accept([service('boarding', 'performing')]);
    ground.accept([service('boarding', 'performing')]);
    ground.accept([service('boarding', 'completed')]);

    expect(logs.filter((line) => line.startsWith('boarding'))).toEqual([
      'boarding performing',
      'boarding completed',
    ]);
  });

  it('says when GSX is found and when it goes away, and never twice over', () => {
    const { feed: ground, logs } = feed();

    ground.setStatus('connected');
    ground.setStatus('connected');
    ground.setStatus('searching');

    expect(logs).toEqual([
      'GSX connected: ground services are being read',
      'GSX not found, retrying in the background',
    ]);
  });

  it('says a connected GSX cannot supply the feed, rather than calling it absent', () => {
    const { feed: ground, registry, logs } = feed();

    ground.setStatus('unsupported');

    expect(registry.snapshot().groundHandling).toBe('unsupported');
    expect(logs).toEqual([
      'GSX is running but does not offer the ground service feed',
    ]);
  });
});
