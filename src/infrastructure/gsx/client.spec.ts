import type { GroundService } from '../../domain/ground-services';
import {
  FAST_RETRY_MS,
  GsxClient,
  type GsxStand,
  type GsxStatus,
  STEADY_RETRY_MS,
} from './client';
import type {
  GsxSocket,
  GsxSocketEvent,
  GsxSocketEventType,
} from './connection';
import boarding from './fixtures/services-boarding.json';
import { SUBSCRIBE_ID } from './probe';

const HELLO = {
  v: 1,
  type: 'hello',
  gsxRunning: true,
  capabilities: ['state', 'services', 'menu', 'gate'],
};

class FakeGsx implements GsxSocket {
  readonly sent: Record<string, unknown>[] = [];
  refuse = false;

  private readonly listeners = new Map<
    GsxSocketEventType,
    ((event: GsxSocketEvent) => void)[]
  >();

  addEventListener(
    type: GsxSocketEventType,
    listener: (event: GsxSocketEvent) => void,
  ): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string): void {
    const message = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(message);

    if (message.type === 'subscribe') {
      this.push({ v: 1, type: 'result', id: SUBSCRIBE_ID, ok: true });
    }
  }

  close(): void {
    this.emit('close', { reason: 'closed' });
  }

  emit(type: GsxSocketEventType, event: GsxSocketEvent = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  push(value: unknown): void {
    this.emit('message', { data: JSON.stringify(value) });
  }
}

type Script = (socket: FakeGsx) => Promise<void> | void;

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function drive(scripts: Script[]) {
  const controller = new AbortController();
  const delays: number[] = [];
  const statuses: GsxStatus[] = [];
  const services: GroundService[][] = [];
  const stands: GsxStand[] = [];
  const sockets: FakeGsx[] = [];

  const client = new GsxClient(
    {
      host: '127.0.0.1',
      port: 8744,
      helloTimeoutMs: 20,
      subscribeTimeoutMs: 20,
      open: () => {
        const socket = new FakeGsx();
        const script = scripts[sockets.length];
        sockets.push(socket);

        queueMicrotask(async () => {
          await script?.(socket);
          await flush();
          await flush();
          socket.close();
        });

        return socket;
      },
      sleep: (ms) => {
        delays.push(ms);

        if (delays.length >= scripts.length) {
          controller.abort();
        }

        return Promise.resolve();
      },
    },
    {
      onStatus: (status) => statuses.push(status),
      onServices: (published) => services.push(published),
      onStand: (stand) => stands.push(stand),
    },
  );

  return {
    delays,
    statuses,
    services,
    stands,
    sockets,
    run: () => client.run(controller.signal),
  };
}

const refuse: Script = (socket) => socket.emit('error', { message: 'refused' });

const handshake: Script = (socket) => {
  socket.emit('open');
  socket.push(HELLO);
};

describe('GsxClient, finding GSX', () => {
  it('waits the steady interval when GSX is not there', async () => {
    const driven = drive([refuse]);

    await driven.run();

    expect(driven.delays).toEqual([STEADY_RETRY_MS]);
    expect(driven.statuses).toEqual(['searching']);
  });

  it('keeps trying, so a GSX started later is picked up on its own', async () => {
    const driven = drive([refuse, refuse, handshake]);

    await driven.run();

    expect(driven.sockets).toHaveLength(3);
    expect(driven.statuses).toContain('connected');
  });

  it('subscribes once the handshake advertises the service feed', async () => {
    const driven = drive([handshake]);

    await driven.run();

    expect(driven.sockets[0]?.sent).toEqual([
      { v: 1, type: 'subscribe', id: SUBSCRIBE_ID },
    ]);
    expect(driven.statuses).toContain('connected');
  });

  it('reports a GSX that cannot supply ground services, and does not subscribe', async () => {
    const driven = drive([
      (socket) => {
        socket.emit('open');
        socket.push({ ...HELLO, capabilities: ['menu', 'gate'] });
      },
    ]);

    await driven.run();

    expect(driven.statuses).toContain('unsupported');
    expect(driven.statuses).not.toContain('connected');
    expect(driven.sockets[0]?.sent).toEqual([]);
  });

  it('reports a socket that opens but never says hello as unsupported, not as absent', async () => {
    const driven = drive([(socket) => socket.emit('open')]);

    await driven.run();

    expect(driven.statuses).toContain('unsupported');
  });
});

describe('GsxClient, reading the feed', () => {
  it('reads the services out of a snapshot', async () => {
    const driven = drive([
      (socket) => {
        handshake(socket);
        socket.push({
          v: 1,
          type: 'snapshot',
          services: boarding.value,
          parking: 'Terminal 4 - Concourse B|Gate 20A',
          airport: { icao: 'KJFK', name: 'Kennedy Intl' },
        });
      },
    ]);

    await driven.run();

    const published = driven.services.at(-2) ?? [];

    expect(published).toHaveLength(12);
    expect(
      published.find((service) => service.id === 'boarding'),
    ).toMatchObject({ state: 'performing', passengers: { done: 1, total: 1 } });
    expect(driven.stands.at(-2)).toEqual({
      airport: 'KJFK',
      parking: 'Terminal 4 - Concourse B|Gate 20A',
    });
  });

  it('replaces the services a patch carries, never merging them', async () => {
    const driven = drive([
      (socket) => {
        handshake(socket);
        socket.push({
          v: 1,
          type: 'snapshot',
          services: [
            { id: 'Boarding', state: 'performing' },
            { id: 'Catering', state: 'performing' },
          ],
        });
        socket.push({
          v: 1,
          type: 'patch',
          path: '/services',
          value: [{ id: 'Boarding', state: 'completed' }],
        });
      },
    ]);

    await driven.run();

    expect(driven.services.at(-2)).toEqual([
      expect.objectContaining({ id: 'boarding', state: 'completed' }),
    ]);
  });

  it('ignores a frame it cannot read rather than falling over', async () => {
    const driven = drive([
      (socket) => {
        handshake(socket);
        socket.emit('message', { data: '{"truncated"' });
        socket.push({ v: 1, type: 'event', topic: 'startup', model: {} });
        socket.push({
          v: 1,
          type: 'patch',
          path: '/services',
          value: [{ id: 'Boarding', state: 'performing' }],
        });
      },
    ]);

    await driven.run();

    expect(driven.services.at(-2)).toEqual([
      expect.objectContaining({ id: 'boarding' }),
    ]);
  });
});

describe('GsxClient, losing GSX', () => {
  it('forgets what it held and reports GSX as absent when the socket drops', async () => {
    const driven = drive([
      (socket) => {
        handshake(socket);
        socket.push({
          v: 1,
          type: 'snapshot',
          services: [{ id: 'Boarding', state: 'performing' }],
        });
        socket.close();
      },
    ]);

    await driven.run();

    expect(driven.statuses).toEqual(['connected', 'searching']);
    expect(driven.services.at(-1)).toEqual([]);
    expect(driven.stands.at(-1)).toEqual({ airport: null, parking: null });
  });

  it('retries quickly after a live session drops, which is what an engine restart looks like', async () => {
    const driven = drive([
      (socket) => {
        handshake(socket);
        socket.close();
      },
    ]);

    await driven.run();

    expect(driven.delays).toEqual([FAST_RETRY_MS]);
  });

  it('falls back to the steady interval when the quick retry finds nothing', async () => {
    const driven = drive([
      (socket) => {
        handshake(socket);
        socket.close();
      },
      refuse,
    ]);

    await driven.run();

    expect(driven.delays).toEqual([FAST_RETRY_MS, STEADY_RETRY_MS]);
  });

  it('adopts the state GSX sends on reconnection', async () => {
    const driven = drive([
      (socket) => {
        handshake(socket);
        socket.push({
          v: 1,
          type: 'snapshot',
          services: [{ id: 'Boarding', state: 'performing' }],
        });
        socket.close();
      },
      (socket) => {
        handshake(socket);
        socket.push({
          v: 1,
          type: 'snapshot',
          services: [{ id: 'Refueling', state: 'performing' }],
        });
      },
    ]);

    await driven.run();

    expect(driven.services.at(-2)).toEqual([
      expect.objectContaining({ id: 'refueling' }),
    ]);
  });

  it('waits the steady interval after an unsupported GSX, not the quick one', async () => {
    const driven = drive([
      (socket) => {
        socket.emit('open');
        socket.push({ ...HELLO, capabilities: ['menu'] });
        socket.close();
      },
    ]);

    await driven.run();

    expect(driven.delays).toEqual([STEADY_RETRY_MS]);
  });
});
