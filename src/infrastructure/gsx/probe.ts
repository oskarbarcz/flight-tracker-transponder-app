import { isRecord } from './capture';
import type { GsxFrame } from './connection';

export const UNKNOWN_TYPE_MESSAGE = 'unknown message type';

export const CONTROL_TYPE = 'zzz.notatype';

export const UNKNOWN_SERVICE = '__probe_no_such_service__';

export const PROBE_TIMEOUT_MS = 2_000;

export const SUBSCRIBE_ID = 'subscribe';

export type ProbeBody = Record<string, unknown>;

export function subscribeRequest(): ProbeBody {
  return { v: 1, type: 'subscribe', id: SUBSCRIBE_ID };
}

export type TypeProbe = {
  type: string;
  body?: ProbeBody;
};

export const TYPE_PROBES: TypeProbe[] = [
  { type: CONTROL_TYPE },
  { type: 'settings.get' },
  { type: 'state.get' },
  { type: 'services.get' },
  { type: 'handler.get' },
  { type: 'gate.list' },
  { type: 'service.trigger', body: { id: UNKNOWN_SERVICE } },
  { type: 'service.bypass', body: { id: UNKNOWN_SERVICE } },
];

export type ProbeAnswer =
  | 'accepted'
  | 'recognised'
  | 'unknown-type'
  | 'no-reply';

export type ProbeOutcome = {
  type: string;
  answer: ProbeAnswer;
  code: string | null;
  message: string | null;
};

export type Sender = (payload: unknown) => void;

export function requestFor(probe: TypeProbe, id: string): ProbeBody {
  return { v: 1, type: probe.type, id, ...(probe.body ?? {}) };
}

export class ResultWaiter {
  private readonly pending = new Map<string, (frame: GsxFrame) => void>();

  accept(frame: GsxFrame): void {
    const id = resultId(frame);

    if (id === null) {
      return;
    }

    const settle = this.pending.get(id);

    if (settle === undefined) {
      return;
    }

    this.pending.delete(id);
    settle(frame);
  }

  wait(id: string, timeoutMs: number): Promise<GsxFrame | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, timeoutMs);

      this.pending.set(id, (frame) => {
        clearTimeout(timer);
        resolve(frame);
      });
    });
  }
}

export class Prober {
  constructor(
    private readonly send: Sender,
    private readonly results: ResultWaiter,
    private readonly timeoutMs: number = PROBE_TIMEOUT_MS,
  ) {}

  async run(probes: TypeProbe[] = TYPE_PROBES): Promise<ProbeOutcome[]> {
    const outcomes: ProbeOutcome[] = [];

    for (const probe of probes) {
      const id = `probe-${probe.type}`;

      this.send(requestFor(probe, id));

      const frame = await this.results.wait(id, this.timeoutMs);

      outcomes.push({ type: probe.type, ...answerOf(frame) });
    }

    return outcomes;
  }
}

export function resultId(frame: GsxFrame): string | null {
  const value = frame.value;

  if (!isRecord(value) || value.type !== 'result') {
    return null;
  }

  return typeof value.id === 'string' ? value.id : null;
}

export function answerOf(frame: GsxFrame | null): {
  answer: ProbeAnswer;
  code: string | null;
  message: string | null;
} {
  if (frame === null) {
    return { answer: 'no-reply', code: null, message: null };
  }

  const value = frame.value;

  if (isRecord(value) && value.ok === true) {
    return { answer: 'accepted', code: null, message: null };
  }

  const error = isRecord(value) && isRecord(value.error) ? value.error : null;
  const code = typeof error?.code === 'string' ? error.code : null;
  const message = typeof error?.message === 'string' ? error.message : null;

  return {
    answer: message === UNKNOWN_TYPE_MESSAGE ? 'unknown-type' : 'recognised',
    code,
    message,
  };
}

export function typeExists(outcome: ProbeOutcome): boolean | null {
  if (outcome.answer === 'no-reply') {
    return null;
  }

  return outcome.answer !== 'unknown-type';
}

export function controlHeld(outcomes: ProbeOutcome[]): boolean {
  const control = outcomes.find((outcome) => outcome.type === CONTROL_TYPE);

  return control?.answer === 'unknown-type';
}
