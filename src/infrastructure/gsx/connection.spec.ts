import {
  type GsxFrame,
  GsxConnection,
  GsxNotReachableError,
  type GsxSocket,
  type GsxSocketEvent,
  type GsxSocketEventType,
  GSX_HOST,
  GSX_PORT,
  gsxUrl,
} from './connection';

class FakeSocket implements GsxSocket {
  readonly sent: string[] = [];
  closed = false;

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
    this.sent.push(data);
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

function connection(): {
  socket: FakeSocket;
  connection: GsxConnection;
} {
  const socket = new FakeSocket();

  return {
    socket,
    connection: new GsxConnection(gsxUrl(GSX_HOST, GSX_PORT), () => socket),
  };
}

const handlers = {
  onFrame: () => undefined,
  onClosed: () => undefined,
};

describe('the GSX address', () => {
  it('is the loopback interface on the port GSX serves', () => {
    expect(gsxUrl(GSX_HOST, GSX_PORT)).toBe('ws://127.0.0.1:8744/');
  });

  it('can be pointed at another machine', () => {
    expect(gsxUrl('sim.lan', 9000)).toBe('ws://sim.lan:9000/');
  });
});

describe('GsxConnection', () => {
  it('opens the socket at the address it was given', () => {
    const opened: string[] = [];
    const socket = new FakeSocket();
    const gsx = new GsxConnection('ws://sim.lan:8744/', (url) => {
      opened.push(url);

      return socket;
    });

    void gsx.connect(handlers);

    expect(opened).toEqual(['ws://sim.lan:8744/']);
  });

  it('resolves once the socket is open', async () => {
    const { socket, connection: gsx } = connection();
    const connecting = gsx.connect(handlers);

    socket.emit('open');

    await expect(connecting).resolves.toBeUndefined();
  });

  it('reports a refused connection as GSX not being reachable', async () => {
    const { socket, connection: gsx } = connection();
    const connecting = gsx.connect(handlers);

    socket.emit('error', { message: 'ECONNREFUSED' });

    await expect(connecting).rejects.toBeInstanceOf(GsxNotReachableError);
  });

  it('reports a socket closed before it opened as GSX not being reachable', async () => {
    const { socket, connection: gsx } = connection();
    const connecting = gsx.connect(handlers);

    socket.emit('close', { reason: 'gone' });

    await expect(connecting).rejects.toBeInstanceOf(GsxNotReachableError);
  });

  it('hands every frame over with the text exactly as it arrived', async () => {
    const frames: GsxFrame[] = [];
    const { socket, connection: gsx } = connection();
    const connecting = gsx.connect({
      onFrame: (frame) => frames.push(frame),
      onClosed: () => undefined,
    });

    socket.emit('open');
    await connecting;
    socket.emit('message', { data: '{"type":"hello","v":1}' });

    expect(frames).toEqual([
      {
        raw: '{"type":"hello","v":1}',
        value: { type: 'hello', v: 1 },
        parsed: true,
      },
    ]);
  });

  it('keeps a frame it cannot parse rather than throwing it away', async () => {
    const frames: GsxFrame[] = [];
    const { socket, connection: gsx } = connection();
    const connecting = gsx.connect({
      onFrame: (frame) => frames.push(frame),
      onClosed: () => undefined,
    });

    socket.emit('open');
    await connecting;
    socket.emit('message', { data: '{"truncated"' });

    expect(frames).toEqual([
      { raw: '{"truncated"', value: null, parsed: false },
    ]);
  });

  it('decodes a frame delivered as bytes', async () => {
    const frames: GsxFrame[] = [];
    const { socket, connection: gsx } = connection();
    const connecting = gsx.connect({
      onFrame: (frame) => frames.push(frame),
      onClosed: () => undefined,
    });

    socket.emit('open');
    await connecting;
    socket.emit('message', {
      data: new TextEncoder().encode('{"gate":"Gate 20A ☹"}'),
    });

    expect(frames[0]?.value).toEqual({ gate: 'Gate 20A ☹' });
  });

  it('reports a socket that closes after it opened', async () => {
    const closed: string[] = [];
    const { socket, connection: gsx } = connection();
    const connecting = gsx.connect({
      onFrame: () => undefined,
      onClosed: (reason) => closed.push(reason),
    });

    socket.emit('open');
    await connecting;
    socket.emit('close', { reason: 'engine restarting' });

    expect(closed).toEqual(['engine restarting']);
  });

  it('sends a payload as JSON text', async () => {
    const { socket, connection: gsx } = connection();
    const connecting = gsx.connect(handlers);

    socket.emit('open');
    await connecting;
    gsx.send({ v: 1, id: 'probe', verb: 'state.get' });

    expect(socket.sent).toEqual(['{"v":1,"id":"probe","verb":"state.get"}']);
  });

  it('sends nothing once it has been disconnected', async () => {
    const { socket, connection: gsx } = connection();
    const connecting = gsx.connect(handlers);

    socket.emit('open');
    await connecting;
    gsx.disconnect();
    gsx.send({ verb: 'state.get' });

    expect(socket.closed).toBe(true);
    expect(socket.sent).toEqual([]);
  });
});
