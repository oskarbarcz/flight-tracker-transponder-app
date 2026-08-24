import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';
import { join } from 'node:path';
import type {
  Presence,
  PresenceWriter,
} from '../../application/ports/presence';
import { type DiscordActivity, toDiscordActivity } from './presence.writer';

const HANDSHAKE = 0;
const FRAME = 1;
const CLOSE = 2;
const PING = 3;
const PONG = 4;

const HEADER_BYTES = 8;
const SOCKET_COUNT = 10;
const CONNECT_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 5_000;

const ACTIVITY_PLAYING = 0;

export class DiscordUnavailableError extends Error {
  constructor() {
    super('Discord is not running: no IPC socket of its answered.');
  }
}

type Pending = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class IpcPresenceWriter implements PresenceWriter {
  private socket: Socket | null = null;
  private ready = false;
  private buffered = Buffer.alloc(0);
  private nonce = 0;
  private handshake: Pending | null = null;
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly applicationId: string,
    private readonly onDisconnected: () => void,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async connect(): Promise<void> {
    if (this.ready) {
      return;
    }

    this.teardown();

    const socket = await openSocket();
    this.socket = socket;
    socket.on('data', (chunk: Buffer) => this.receive(chunk));
    socket.on('error', () => this.lost());
    socket.on('close', () => this.lost());

    await new Promise<void>((resolve, reject) => {
      this.handshake = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.handshake = null;
          this.teardown();
          reject(new Error('Discord did not answer the handshake in time.'));
        }, CONNECT_TIMEOUT_MS),
      };

      this.send(HANDSHAKE, { v: 1, client_id: this.applicationId });
    });

    this.ready = true;
  }

  async setActivity(presence: Presence): Promise<void> {
    const activity = toDiscordActivity(presence);

    await this.connect();
    await this.request({
      pid: process.pid,
      activity: toWire(activity, this.now),
    });
  }

  async clearActivity(): Promise<void> {
    if (!this.ready) {
      return;
    }

    await this.request({ pid: process.pid });
  }

  async disconnect(): Promise<void> {
    this.teardown();

    return Promise.resolve();
  }

  private request(args: Record<string, unknown>): Promise<void> {
    this.nonce += 1;
    const nonce = String(this.nonce);

    return new Promise<void>((resolve, reject) => {
      this.pending.set(nonce, {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.pending.delete(nonce);
          reject(new Error('Discord did not answer SET_ACTIVITY in time.'));
        }, REQUEST_TIMEOUT_MS),
      });

      this.send(FRAME, { cmd: 'SET_ACTIVITY', args, nonce });
    });
  }

  private send(op: number, payload: unknown): void {
    const body = Buffer.from(JSON.stringify(payload), 'utf-8');
    const header = Buffer.alloc(HEADER_BYTES);

    header.writeUInt32LE(op, 0);
    header.writeUInt32LE(body.length, 4);
    this.socket?.write(Buffer.concat([header, body]));
  }

  private receive(chunk: Buffer): void {
    this.buffered = Buffer.concat([this.buffered, chunk]);

    while (this.buffered.length >= HEADER_BYTES) {
      const op = this.buffered.readUInt32LE(0);
      const length = this.buffered.readUInt32LE(4);

      if (this.buffered.length < HEADER_BYTES + length) {
        return;
      }

      const body = this.buffered.subarray(HEADER_BYTES, HEADER_BYTES + length);
      this.buffered = this.buffered.subarray(HEADER_BYTES + length);
      this.handle(op, body.toString('utf-8'));
    }
  }

  private handle(op: number, body: string): void {
    if (op === PING) {
      this.send(PONG, safeParse(body));

      return;
    }

    if (op === CLOSE) {
      this.lost();

      return;
    }

    if (op !== FRAME) {
      return;
    }

    const message = safeParse(body) as {
      evt?: unknown;
      nonce?: unknown;
      data?: { message?: unknown };
    };

    if (message.evt === 'READY') {
      this.settleHandshake();

      return;
    }

    const nonce = typeof message.nonce === 'string' ? message.nonce : null;
    const waiting = nonce === null ? undefined : this.pending.get(nonce);

    if (waiting === undefined) {
      return;
    }

    this.pending.delete(nonce as string);
    clearTimeout(waiting.timer);

    if (message.evt === 'ERROR') {
      const reason =
        typeof message.data?.message === 'string'
          ? message.data.message
          : 'Discord rejected the activity.';
      waiting.reject(new Error(reason));

      return;
    }

    waiting.resolve();
  }

  private settleHandshake(): void {
    const handshake = this.handshake;
    this.handshake = null;

    if (handshake === null) {
      return;
    }

    clearTimeout(handshake.timer);
    handshake.resolve();
  }

  private lost(): void {
    const wasReady = this.ready;
    this.teardown();

    if (wasReady) {
      this.onDisconnected();
    }
  }

  private teardown(): void {
    const socket = this.socket;

    this.socket = null;
    this.ready = false;
    this.buffered = Buffer.alloc(0);

    if (this.handshake !== null) {
      clearTimeout(this.handshake.timer);
      this.handshake.reject(new DiscordUnavailableError());
      this.handshake = null;
    }

    for (const [nonce, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error('Discord closed the connection.'));
      this.pending.delete(nonce);
    }

    socket?.removeAllListeners();
    socket?.destroy();
  }
}

function toWire(
  activity: DiscordActivity,
  now: () => number,
): Record<string, unknown> {
  const timestamps: Record<string, number> = {};

  if (activity.startTimestamp !== undefined) {
    timestamps.start = activity.startTimestamp;
  }

  if (activity.endTimestamp !== undefined) {
    timestamps.end = activity.endTimestamp;
  }

  return {
    type: ACTIVITY_PLAYING,
    created_at: now(),
    instance: false,
    details: activity.details,
    state: activity.state,
    ...(Object.keys(timestamps).length > 0 ? { timestamps } : {}),
    assets: {
      large_image: activity.largeImageKey,
      small_image: activity.smallImageKey,
    },
  };
}

export function socketDirectories(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (platform === 'win32') {
    return ['\\\\?\\pipe\\'];
  }

  const base =
    env.XDG_RUNTIME_DIR ?? env.TMPDIR ?? env.TMP ?? env.TEMP ?? '/tmp';

  return [
    base,
    join(base, 'app', 'com.discordapp.Discord'),
    join(base, 'snap.discord'),
  ];
}

async function openSocket(): Promise<Socket> {
  let failure: Error = new DiscordUnavailableError();

  for (const directory of socketDirectories()) {
    for (let index = 0; index < SOCKET_COUNT; index += 1) {
      const candidate =
        process.platform === 'win32'
          ? `${directory}discord-ipc-${index}`
          : join(directory, `discord-ipc-${index}`);

      if (process.platform !== 'win32' && !(await exists(candidate))) {
        continue;
      }

      try {
        return await attach(candidate);
      } catch (error) {
        failure = error instanceof Error ? error : failure;
      }
    }
  }

  throw failure;
}

function attach(path: string): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const socket = connect(path);
    const settle = (error?: Error): void => {
      socket.removeListener('connect', onConnect);
      socket.removeListener('error', onError);
      clearTimeout(timer);

      if (error === undefined) {
        resolve(socket);

        return;
      }

      socket.destroy();
      reject(error);
    };

    const onConnect = (): void => settle();
    const onError = (error: Error): void => settle(error);
    const timer = setTimeout(
      () => settle(new Error(`${path} did not accept a connection in time.`)),
      CONNECT_TIMEOUT_MS,
    );

    socket.once('connect', onConnect);
    socket.once('error', onError);
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);

    return true;
  } catch {
    return false;
  }
}

function safeParse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
