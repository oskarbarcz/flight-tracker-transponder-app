import type { GroundService } from '../../domain/ground-services';
import { GsxConnection, type SocketOpener, gsxUrl } from './connection';
import { decode } from './frames';
import { subscribeRequest, SUBSCRIBE_ID } from './probe';
import { readServices } from './services.reader';
import { GsxState } from './state';

export const REQUIRED_CAPABILITY = 'services';

export const HELLO_TIMEOUT_MS = 5_000;

export const SUBSCRIBE_TIMEOUT_MS = 5_000;

export const FAST_RETRY_MS = 1_000;

export const STEADY_RETRY_MS = 20_000;

export type GsxStatus = 'searching' | 'connected' | 'unsupported';

export type GsxStand = {
  airport: string | null;
  parking: string | null;
};

export type GsxClientHandlers = {
  onStatus: (status: GsxStatus) => void;
  onServices: (services: GroundService[]) => void;
  onStand: (stand: GsxStand) => void;
};

export type GsxClientOptions = {
  host: string;
  port: number;
  open?: SocketOpener;
  sleep?: (ms: number) => Promise<void>;
  helloTimeoutMs?: number;
  subscribeTimeoutMs?: number;
};

type Session = {
  supported: boolean;
  closed: Promise<void>;
};

export class GsxClient {
  private readonly state = new GsxState();
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly options: GsxClientOptions,
    private readonly handlers: GsxClientHandlers,
  ) {
    this.sleep = options.sleep ?? defaultSleep;
  }

  async run(signal: AbortSignal): Promise<void> {
    let delayMs = STEADY_RETRY_MS;

    while (!signal.aborted) {
      delayMs = await this.attempt(signal);

      if (signal.aborted) {
        return;
      }

      await this.sleep(delayMs);
    }
  }

  private async attempt(signal: AbortSignal): Promise<number> {
    const connection = new GsxConnection(
      gsxUrl(this.options.host, this.options.port),
      this.options.open,
    );

    let session: Session;

    try {
      session = await this.open(connection, signal);
    } catch {
      this.forget();

      return STEADY_RETRY_MS;
    }

    await session.closed;
    this.forget();

    return session.supported ? FAST_RETRY_MS : STEADY_RETRY_MS;
  }

  private async open(
    connection: GsxConnection,
    signal: AbortSignal,
  ): Promise<Session> {
    let settleHello: ((capabilities: string[]) => void) | null = null;
    let settleSubscribe: (() => void) | null = null;
    let settleClosed: (() => void) | null = null;

    const hello = new Promise<string[]>((resolve) => {
      settleHello = resolve;
    });
    const subscribed = new Promise<void>((resolve) => {
      settleSubscribe = resolve;
    });
    const closed = new Promise<void>((resolve) => {
      settleClosed = resolve;
    });

    await connection.connect({
      onFrame: (frame) => {
        const decoded = decode(frame);

        if (decoded.kind === 'hello') {
          settleHello?.(decoded.capabilities);

          return;
        }

        if (decoded.kind === 'result' && decoded.id === SUBSCRIBE_ID) {
          settleSubscribe?.();

          return;
        }

        if (decoded.kind === 'snapshot') {
          this.state.replaceAll(decoded.state);
          this.publish();

          return;
        }

        if (decoded.kind === 'patch') {
          this.state.replace(decoded.key, decoded.value);
          this.publish();
        }
      },
      onClosed: () => settleClosed?.(),
    });

    const abort = (): void => connection.disconnect();
    signal.addEventListener('abort', abort, { once: true });
    void closed.then(() => signal.removeEventListener('abort', abort));

    const capabilities = await within(
      hello,
      this.options.helloTimeoutMs ?? HELLO_TIMEOUT_MS,
    );

    if (capabilities === null || !capabilities.includes(REQUIRED_CAPABILITY)) {
      this.handlers.onStatus('unsupported');

      return { supported: false, closed };
    }

    connection.send(subscribeRequest());

    await within(
      subscribed,
      this.options.subscribeTimeoutMs ?? SUBSCRIBE_TIMEOUT_MS,
    );

    this.handlers.onStatus('connected');

    return { supported: true, closed };
  }

  private publish(): void {
    this.handlers.onServices(readServices(this.state.get('services')));
    this.handlers.onStand({
      airport: icaoOf(this.state.get('airport')),
      parking: textOf(this.state.get('parking')),
    });
  }

  private forget(): void {
    this.state.clear();
    this.handlers.onStatus('searching');
    this.handlers.onServices([]);
    this.handlers.onStand({ airport: null, parking: null });
  }
}

function icaoOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  return textOf((value as { icao?: unknown }).icao);
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);

    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
