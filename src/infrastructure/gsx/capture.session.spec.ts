import { CaptureSession } from './capture.session';
import type {
  GsxSocket,
  GsxSocketEvent,
  GsxSocketEventType,
} from './connection';
import { CONTROL_VERB, ENVELOPES } from './probe';

class FakeGsx implements GsxSocket {
  readonly sent: Record<string, unknown>[] = [];
  closed = false;

  private readonly listeners = new Map<
    GsxSocketEventType,
    ((event: GsxSocketEvent) => void)[]
  >();

  constructor(private readonly answers: (verb: string) => string | null) {}

  addEventListener(
    type: GsxSocketEventType,
    listener: (event: GsxSocketEvent) => void,
  ): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string): void {
    const message = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(message);

    const verb = String(message.verb ?? message.type);
    const code = this.answers(verb);

    if (code === null) {
      return;
    }

    queueMicrotask(() =>
      this.emit('message', {
        data: JSON.stringify({
          v: 1,
          type: 'result',
          id: message.id,
          ok: false,
          error: { code, message: verb },
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
    const socket = new FakeGsx(() => 'unknown_verb');
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

  it('tries the control verb first, so an answer proves the envelope', async () => {
    const socket = new FakeGsx((verb) =>
      verb === CONTROL_VERB ? 'unknown_verb' : 'not_found',
    );
    const { session: capture } = session(socket);
    const starting = capture.start();

    socket.emit('open');
    await starting;
    await capture.probe();

    expect(socket.sent[0]).toMatchObject({
      verb: CONTROL_VERB,
      id: `probe-control-${ENVELOPES[0]?.name}`,
    });
    expect(capture.report().join('\n')).toContain('exists');
  });

  it('runs no probes when GSX answers no envelope', async () => {
    const socket = new FakeGsx(() => null);
    const { session: capture } = session(socket);
    const starting = capture.start();

    socket.emit('open');
    await starting;
    await capture.probe();

    expect(socket.sent).toHaveLength(ENVELOPES.length);
    expect(capture.report().join('\n')).toContain('inconclusive');
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
    const socket = new FakeGsx(() => 'unknown_verb');
    const { session: capture } = session(socket);
    const starting = capture.start();

    socket.emit('open');
    await starting;
    await capture.probe();

    for (const message of socket.sent) {
      expect(JSON.stringify(message)).not.toContain('menu.');
    }
  });
});
