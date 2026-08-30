import { appendFileSync } from 'node:fs';
import type { GsxFrame } from './connection';

export const CAPTURE_FILE_NAME = 'gsx-capture.jsonl';

export type CaptureSink = (line: string) => void;

export type CaptureSummary = {
  hello: string | null;
  frames: number;
  unparsed: number;
  pushed: number;
  types: string[];
  keys: string[];
  services: string[];
  serviceStates: string[];
};

export function fileSink(path: string): CaptureSink {
  return (line) => appendFileSync(path, `${line}\n`, 'utf-8');
}

export class CaptureRecorder {
  private frames = 0;
  private unparsed = 0;
  private pushed = 0;
  private hello: string | null = null;

  private readonly types = new Set<string>();

  private readonly keys = new Set<string>();
  private readonly services = new Set<string>();
  private readonly serviceStates = new Set<string>();

  constructor(
    private readonly sink: CaptureSink,
    private readonly now: () => Date = () => new Date(),
  ) {}

  record(frame: GsxFrame): void {
    this.frames += 1;

    if (!frame.parsed) {
      this.unparsed += 1;
    }

    this.sink(
      JSON.stringify({ receivedAt: this.now().toISOString(), raw: frame.raw }),
    );

    this.observe(frame);
  }

  summary(): CaptureSummary {
    return {
      hello: this.hello,
      frames: this.frames,
      unparsed: this.unparsed,
      pushed: this.pushed,
      types: [...this.types].sort(),
      keys: [...this.keys].sort(),
      services: [...this.services].sort(),
      serviceStates: [...this.serviceStates].sort(),
    };
  }

  private observe(frame: GsxFrame): void {
    const value = frame.value;

    if (!isRecord(value)) {
      return;
    }

    if (typeof value.type === 'string') {
      this.types.add(value.type);
    }

    if (value.type !== 'hello' && value.type !== 'result') {
      this.pushed += 1;
    }

    if (value.type === 'hello') {
      this.hello ??= frame.raw;

      return;
    }

    if (value.type === 'snapshot') {
      for (const key of Object.keys(value)) {
        if (!ENVELOPE.includes(key)) {
          this.keys.add(key);
        }
      }

      this.noteServices(value.services);

      return;
    }

    if (value.type === 'patch') {
      const key = pathKey(value.path);

      if (key !== null) {
        this.keys.add(key);
      }

      if (key === 'services') {
        this.noteServices(value.value);
      }
    }
  }

  private noteServices(value: unknown): void {
    if (!Array.isArray(value)) {
      return;
    }

    for (const entry of value) {
      if (!isRecord(entry)) {
        continue;
      }

      if (typeof entry.id === 'string') {
        this.services.add(entry.id);
      }

      if (typeof entry.state === 'string') {
        this.serviceStates.add(entry.state);
      }
    }
  }
}

const ENVELOPE = ['v', 'type', 'ts', 'id', 'ok', 'error'];

export function pathKey(path: unknown): string | null {
  if (typeof path !== 'string') {
    return null;
  }

  const key = path.replace(/^\/+/, '');

  return key === '' || key.includes('/') ? null : key;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
