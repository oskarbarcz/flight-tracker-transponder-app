export const GSX_HOST = '127.0.0.1';

export const GSX_PORT = 8744;

export type GsxFrame = {
  raw: string;
  value: unknown;
  parsed: boolean;
};

export type GsxHandlers = {
  onFrame: (frame: GsxFrame) => void;
  onClosed: (reason: string) => void;
};

export type GsxSocketEvent = {
  data?: unknown;
  reason?: string;
  message?: string;
};

export type GsxSocketEventType = 'open' | 'message' | 'close' | 'error';

export type GsxSocket = {
  addEventListener: (
    type: GsxSocketEventType,
    listener: (event: GsxSocketEvent) => void,
  ) => void;
  send: (data: string) => void;
  close: () => void;
};

export type SocketOpener = (url: string) => GsxSocket;

export class GsxNotReachableError extends Error {
  constructor(detail: string) {
    super(
      detail === ''
        ? 'GSX did not answer on its remote interface.'
        : `GSX did not answer on its remote interface: ${detail}`,
    );
  }
}

export function gsxUrl(host: string, port: number): string {
  return `ws://${host}:${port}/`;
}

export const openWebSocket: SocketOpener = (url) => {
  const socket = new WebSocket(url);

  return {
    addEventListener: (type, listener) =>
      socket.addEventListener(type, (event) =>
        listener(event as GsxSocketEvent),
      ),
    send: (data) => socket.send(data),
    close: () => socket.close(),
  };
};

export class GsxConnection {
  private socket: GsxSocket | null = null;

  constructor(
    private readonly url: string = gsxUrl(GSX_HOST, GSX_PORT),
    private readonly open: SocketOpener = openWebSocket,
  ) {}

  connect(handlers: GsxHandlers): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.open(this.url);
      let opened = false;

      this.socket = socket;

      socket.addEventListener('open', () => {
        opened = true;
        resolve();
      });

      socket.addEventListener('message', (event) =>
        handlers.onFrame(frameOf(event.data)),
      );

      socket.addEventListener('error', (event) => {
        if (!opened) {
          reject(new GsxNotReachableError(detailOf(event)));
        }
      });

      socket.addEventListener('close', (event) => {
        this.socket = null;

        if (opened) {
          handlers.onClosed(detailOf(event));
        } else {
          reject(new GsxNotReachableError(detailOf(event)));
        }
      });
    });
  }

  send(payload: unknown): void {
    this.socket?.send(JSON.stringify(payload));
  }

  disconnect(): void {
    const socket = this.socket;

    this.socket = null;
    socket?.close();
  }
}

function frameOf(data: unknown): GsxFrame {
  const raw = textOf(data);

  try {
    return { raw, value: JSON.parse(raw) as unknown, parsed: true };
  } catch {
    return { raw, value: null, parsed: false };
  }
}

function textOf(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
  }

  return '';
}

function detailOf(event: GsxSocketEvent): string {
  return (event.reason ?? event.message ?? '').trim();
}
