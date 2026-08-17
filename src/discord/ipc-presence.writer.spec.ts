import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DiscordUnavailableError,
  IpcPresenceWriter,
  socketDirectories,
} from './ipc-presence.writer';

const HANDSHAKE = 0;
const FRAME = 1;
const PING = 3;
const PONG = 4;

type Frame = { op: number; body: Record<string, unknown> };

class FakeDiscord {
  readonly received: Frame[] = [];

  private server: Server | null = null;
  private client: Socket | null = null;
  private buffered = Buffer.alloc(0);

  answerHandshake = true;
  rejectActivity = false;
  splitEveryByte = false;

  constructor(private readonly directory: string) {}

  async start(index = 0): Promise<void> {
    this.server = createServer((socket) => {
      this.client = socket;
      socket.on('data', (chunk: Buffer) => this.receive(chunk));
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(
        join(this.directory, `discord-ipc-${index}`),
        resolve,
      );
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.client?.destroy();

    await new Promise<void>((resolve) => {
      server === null ? resolve() : server.close(() => resolve());
    });
  }

  ping(): void {
    this.send(PING, { nonce: 'ping' });
  }

  hangUp(): void {
    this.client?.destroy();
  }

  private receive(chunk: Buffer): void {
    this.buffered = Buffer.concat([this.buffered, chunk]);

    while (this.buffered.length >= 8) {
      const op = this.buffered.readUInt32LE(0);
      const length = this.buffered.readUInt32LE(4);

      if (this.buffered.length < 8 + length) {
        return;
      }

      const body = JSON.parse(
        this.buffered.subarray(8, 8 + length).toString('utf-8'),
      ) as Record<string, unknown>;
      this.buffered = this.buffered.subarray(8 + length);
      this.received.push({ op, body });
      this.answer(op, body);
    }
  }

  private answer(op: number, body: Record<string, unknown>): void {
    if (op === HANDSHAKE) {
      if (this.answerHandshake) {
        this.send(FRAME, { evt: 'READY', data: { v: 1 } });
      }

      return;
    }

    if (op === FRAME && body.cmd === 'SET_ACTIVITY') {
      this.send(
        FRAME,
        this.rejectActivity
          ? {
              evt: 'ERROR',
              nonce: body.nonce,
              data: { code: 4000, message: 'Invalid activity' },
            }
          : { evt: null, cmd: 'SET_ACTIVITY', nonce: body.nonce, data: {} },
      );
    }
  }

  private send(op: number, payload: unknown): void {
    const body = Buffer.from(JSON.stringify(payload), 'utf-8');
    const header = Buffer.alloc(8);
    header.writeUInt32LE(op, 0);
    header.writeUInt32LE(body.length, 4);
    const frame = Buffer.concat([header, body]);

    if (!this.splitEveryByte) {
      this.client?.write(frame);

      return;
    }

    for (const byte of frame) {
      this.client?.write(Buffer.from([byte]));
    }
  }
}

const activity = {
  details: 'Boston (BOS) -> Philadelphia (PHL)',
  state: 'Cruise, landing at 15:50 UTC',
  startTimestamp: Date.UTC(2026, 7, 14, 13, 0, 0),
  endTimestamp: Date.UTC(2026, 7, 14, 15, 50, 0),
  largeImageKey: 'msfs2024',
  smallImageKey: 'flight-tracker',
};

describe('IpcPresenceWriter', () => {
  let directory: string;
  let discord: FakeDiscord;
  let lost: number;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ft-ipc-'));
    process.env.XDG_RUNTIME_DIR = directory;
    discord = new FakeDiscord(directory);
    lost = 0;
    await discord.start();
  });

  afterEach(async () => {
    await discord.stop();
    delete process.env.XDG_RUNTIME_DIR;
    rmSync(directory, { recursive: true, force: true });
  });

  function writer(): IpcPresenceWriter {
    return new IpcPresenceWriter(
      '1536756124894629970',
      () => {
        lost += 1;
      },
      () => Date.UTC(2026, 7, 14, 12, 0, 0),
    );
  }

  it('handshakes with the application id before anything else', async () => {
    const presence = writer();
    await presence.connect();
    await presence.disconnect();

    expect(discord.received[0]).toEqual({
      op: HANDSHAKE,
      body: { v: 1, client_id: '1536756124894629970' },
    });
  });

  it('sends the activity in the shape the library did', async () => {
    const presence = writer();
    await presence.setActivity(activity);
    await presence.disconnect();

    const frame = discord.received.find((each) => each.op === FRAME);

    expect(frame?.body).toEqual({
      cmd: 'SET_ACTIVITY',
      nonce: '1',
      args: {
        pid: process.pid,
        activity: {
          type: 0,
          created_at: Date.UTC(2026, 7, 14, 12, 0, 0),
          instance: false,
          details: 'Boston (BOS) -> Philadelphia (PHL)',
          state: 'Cruise, landing at 15:50 UTC',
          timestamps: {
            start: Date.UTC(2026, 7, 14, 13, 0, 0),
            end: Date.UTC(2026, 7, 14, 15, 50, 0),
          },
          assets: {
            large_image: 'msfs2024',
            small_image: 'flight-tracker',
          },
        },
      },
    });
  });

  it('omits the timestamps entirely when there are none', async () => {
    const presence = writer();
    await presence.setActivity({
      details: 'd',
      state: 's',
      largeImageKey: 'l',
      smallImageKey: 'm',
    });
    await presence.disconnect();

    const frame = discord.received.find((each) => each.op === FRAME);
    const args = frame?.body.args as
      | { activity: Record<string, unknown> }
      | undefined;

    expect(args?.activity).not.toHaveProperty('timestamps');
  });

  it('clears the activity by sending no activity at all', async () => {
    const presence = writer();
    await presence.setActivity(activity);
    await presence.clearActivity();
    await presence.disconnect();

    const frames = discord.received.filter((each) => each.op === FRAME);

    expect(frames).toHaveLength(2);
    expect(frames[1]?.body.args).toEqual({ pid: process.pid });
  });

  it('reads a frame that arrives one byte at a time', async () => {
    discord.splitEveryByte = true;

    const presence = writer();
    await presence.setActivity(activity);
    await presence.disconnect();

    expect(discord.received.filter((each) => each.op === FRAME)).toHaveLength(
      1,
    );
  });

  it('answers a ping with a pong, so Discord does not hang up', async () => {
    const presence = writer();
    await presence.connect();
    discord.ping();

    await new Promise((resolve) => setTimeout(resolve, 100));
    await presence.disconnect();

    expect(discord.received.some((each) => each.op === PONG)).toBe(true);
  });

  it('reports the reason when Discord refuses the activity', async () => {
    discord.rejectActivity = true;
    const presence = writer();

    await expect(presence.setActivity(activity)).rejects.toThrow(
      'Invalid activity',
    );
    await presence.disconnect();
  });

  it('connects once and stays connected', async () => {
    const presence = writer();
    await presence.connect();
    await presence.connect();
    await presence.connect();
    await presence.disconnect();

    expect(
      discord.received.filter((each) => each.op === HANDSHAKE),
    ).toHaveLength(1);
  });

  it('says Discord is not running when no socket answers', async () => {
    await discord.stop();
    rmSync(directory, { recursive: true, force: true });

    await expect(writer().connect()).rejects.toThrow(DiscordUnavailableError);
  });

  it('finds the socket whichever of the ten it is on', async () => {
    await discord.stop();
    discord = new FakeDiscord(directory);
    await discord.start(4);

    const presence = writer();
    await presence.connect();
    await presence.disconnect();

    expect(discord.received[0]?.op).toBe(HANDSHAKE);
  });

  it('reports a connection Discord dropped, once', async () => {
    const presence = writer();
    await presence.connect();

    discord.hangUp();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(lost).toBe(1);
  });

  it('does not report a disconnection it was asked for', async () => {
    const presence = writer();
    await presence.connect();
    await presence.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(lost).toBe(0);
  });

  it('reconnects after Discord came back', async () => {
    const presence = writer();
    await presence.connect();
    discord.hangUp();
    await new Promise((resolve) => setTimeout(resolve, 50));

    await presence.connect();
    await presence.disconnect();

    expect(
      discord.received.filter((each) => each.op === HANDSHAKE),
    ).toHaveLength(2);
  });
});

describe('socketDirectories', () => {
  it('names the pipe prefix on Windows', () => {
    expect(socketDirectories('win32', {})).toEqual(['\\\\?\\pipe\\']);
  });

  it('prefers the runtime directory, then the temporary one', () => {
    expect(
      socketDirectories('linux', { XDG_RUNTIME_DIR: '/run/1000' })[0],
    ).toBe('/run/1000');
    expect(socketDirectories('darwin', { TMPDIR: '/var/t' })[0]).toBe('/var/t');
    expect(socketDirectories('linux', {})[0]).toBe('/tmp');
  });

  it('looks where a sandboxed Discord puts it too', () => {
    const directories = socketDirectories('linux', { XDG_RUNTIME_DIR: '/run' });

    expect(directories).toContain('/run/app/com.discordapp.Discord');
    expect(directories).toContain('/run/snap.discord');
  });
});
