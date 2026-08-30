import { CaptureSession } from './capture.session';
import type {
  GsxSocket,
  GsxSocketEvent,
  GsxSocketEventType,
} from './connection';
import {
  CONTROL_TYPE,
  SUBSCRIBE_ID,
  TYPE_PROBES,
  UNKNOWN_TYPE_MESSAGE,
} from './probe';

class FakeGsx implements GsxSocket {
  readonly sent: Record<string, unknown>[] = [];
  closed = false;

  private readonly listeners = new Map<
    GsxSocketEventType,
    ((event: GsxSocketEvent) => void)[]
  >();

  constructor(private readonly answers: (type: string) => string | null) {}

  addEventListener(
    type: GsxSocketEventType,
    listener: (event: GsxSocketEvent) => void,
  ): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string): void {
    const message = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(message);

    const type = String(message.type);
    const complaint = this.answers(type);

    if (complaint === null) {
      return;
    }

    queueMicrotask(() =>
      this.emit('message', {
        data: JSON.stringify({
          v: 1,
          type: 'result',
          id: message.id,
          ok: false,
          error: { code: 'bad_args', message: complaint },
        }),
      }),
    );
  }

  close(): void {
    this.closed = true;
  }

  emit(type: GsxSocketEventType, event: GsxSocketEvent = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function session(socket: FakeGsx): {
  lines: string[];
  session: CaptureSession;
} {
  const lines: string[] = [];

  return {
    lines,
    session: new CaptureSession({
      url: 'ws://127.0.0.1:8744/',
      file: 'gsx-capture.jsonl',
      sink: (line) => lines.push(line),
      onClosed: () => undefined,
      open: () => socket,
      now: () => new Date('2026-08-30T12:00:00.000Z'),
      timeoutMs: 5,
    }),
  };
}

const SNAPSHOT = JSON.stringify({
  v: 1,
  type: 'snapshot',
  services: [{ id: 'Boarding', state: 'performing' }],
  parking: 'Terminal 4 - Concourse B|Gate 20A',
});

describe('CaptureSession', () => {
  it('records every frame it receives and reports on what it saw', async () => {
    const socket = new FakeGsx(() => UNKNOWN_TYPE_MESSAGE);
    const { lines, session: capture } = session(socket);
    const starting = capture.start();

    socket.emit('open');
    await starting;
    socket.emit('message', { data: '{"type":"hello","gsxRunning":true}' });
    socket.emit('message', { data: SNAPSHOT });

    await capture.probe();

    const text = capture.report().join('\n');

    expect(lines).toHaveLength(2 + socket.sent.length);
    expect(text).toContain('{"type":"hello","gsxRunning":true}');
    expect(text).toContain('Boarding');
    expect(text).toContain('performing');
    expect(text).toContain('parking');
  });

  it('probes the control type first, and sends the verb as the message type', async () => {
    const socket = new FakeGsx((type) =>
      type === 'settings.get'
        ? 'missing parameter "page"'
        : UNKNOWN_TYPE_MESSAGE,
    );
    const { session: capture } = session(socket);
    const starting = capture.start();

    socket.emit('open');
    await starting;
    await capture.probe();

    expect(socket.sent[0]).toEqual({
      v: 1,
      type: CONTROL_TYPE,
      id: `probe-${CONTROL_TYPE}`,
    });
    expect(socket.sent).toHaveLength(TYPE_PROBES.length);

    const text = capture.report().join('\n');

    expect(text).toContain('settings.get');
    expect(text).toContain('KNOWN');
    expect(text).not.toContain('inconclusive');
  });

  it('calls the probes inconclusive when the control type was not refused as unknown', async () => {
    const socket = new FakeGsx(() => 'something else entirely');
    const { session: capture } = session(socket);
    const starting = capture.start();

    socket.emit('open');
    await starting;
    await capture.probe();

    expect(capture.report().join('\n')).toContain('inconclusive');
  });

  it('reports that GSX pushed nothing when only hellos and results arrived', async () => {
    const socket = new FakeGsx(() => UNKNOWN_TYPE_MESSAGE);
    const { session: capture } = session(socket);
    const starting = capture.start();

    socket.emit('open');
    await starting;
    socket.emit('message', { data: '{"v":1,"type":"hello"}' });
    await capture.probe();

    expect(capture.report().join('\n')).toContain(
      'GSX sent no state of its own',
    );
  });

  it("subscribes before anything else, which is what opens GSX's feed", async () => {
    const socket = new FakeGsx(() => null);
    const { session: capture } = session(socket);
    const starting = capture.start();

    socket.emit('open');
    await starting;

    const subscribing = capture.subscribe();

    socket.emit('message', {
      data: JSON.stringify({
        v: 1,
        type: 'result',
        id: SUBSCRIBE_ID,
        ok: true,
      }),
    });

    await expect(subscribing).resolves.toMatchObject({
      type: 'subscribe',
      answer: 'accepted',
    });
    expect(socket.sent[0]).toEqual({
      v: 1,
      type: 'subscribe',
      id: SUBSCRIBE_ID,
    });
  });

  it('reports the subscription alongside the probes', async () => {
    const socket = new FakeGsx(() => UNKNOWN_TYPE_MESSAGE);
    const { session: capture } = session(socket);
    const starting = capture.start();

    socket.emit('open');
    await starting;
    await capture.subscribe();
    await capture.probe();

    expect(capture.report().join('\n')).toContain('subscribe');
  });

  it('never asks GSX to stop sending, which would end the recording', () => {
    for (const probe of TYPE_PROBES) {
      expect(probe.type).not.toBe('unsubscribe');
    }
  });

  it('closes the socket when it is stopped', async () => {
    const socket = new FakeGsx(() => null);
    const { session: capture } = session(socket);
    const starting = capture.start();

    socket.emit('open');
    await starting;
    capture.stop();

    expect(socket.closed).toBe(true);
  });

  it('never sends a menu verb', async () => {
    const socket = new FakeGsx(() => UNKNOWN_TYPE_MESSAGE);
    const { session: capture } = session(socket);
    const starting = capture.start();

    socket.emit('open');
    await starting;
    await capture.probe();

    for (const message of socket.sent) {
      expect(JSON.stringify(message)).not.toContain('menu.pick');
      expect(JSON.stringify(message)).not.toContain('gate.select');
    }
  });
});
