import { isRecord } from './capture';
import type { GsxFrame } from './connection';

export const CONTROL_VERB = 'zzz.notaverb';

export const UNKNOWN_SERVICE = '__probe_no_such_service__';

export const PROBE_TIMEOUT_MS = 2_000;

export type ProbeArgs = Record<string, unknown>;

export type Envelope = {
  name: string;
  build: (id: string, verb: string, args: ProbeArgs) => Record<string, unknown>;
};

export const ENVELOPES: Envelope[] = [
  {
    name: 'typed',
    build: (id, verb, args) => ({ v: 1, type: 'request', id, verb, args }),
  },
  {
    name: 'bare',
    build: (id, verb, args) => ({ v: 1, id, verb, args }),
  },
  {
    name: 'verb-as-type',
    build: (id, verb, args) => ({ v: 1, type: verb, id, ...args }),
  },
];

export type ProbeRequest = {
  verb: string;
  args: ProbeArgs;
};

export const PROBES: ProbeRequest[] = [
  { verb: 'service.trigger', args: { id: UNKNOWN_SERVICE } },
  { verb: 'services.trigger', args: { id: UNKNOWN_SERVICE } },
  { verb: 'service.request', args: { id: UNKNOWN_SERVICE } },
  { verb: 'service.bypass', args: { id: UNKNOWN_SERVICE } },
  { verb: 'state.get', args: {} },
  { verb: 'services.get', args: {} },
  { verb: 'handler.get', args: {} },
  { verb: 'gate.list', args: {} },
];

export type ProbeAnswer = 'accepted' | 'refused' | 'unknown-verb' | 'no-reply';

export type ProbeOutcome = {
  verb: string;
  answer: ProbeAnswer;
  code: string | null;
  raw: string | null;
};

export type Sender = (payload: unknown) => void;

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

  async discoverEnvelope(): Promise<Envelope | null> {
    for (const envelope of ENVELOPES) {
      const id = `probe-control-${envelope.name}`;

      this.send(envelope.build(id, CONTROL_VERB, {}));

      if ((await this.results.wait(id, this.timeoutMs)) !== null) {
        return envelope;
      }
    }

    return null;
  }

  async run(
    envelope: Envelope,
    probes: ProbeRequest[] = PROBES,
  ): Promise<ProbeOutcome[]> {
    const outcomes: ProbeOutcome[] = [];

    for (const probe of probes) {
      const id = `probe-${probe.verb}`;

      this.send(envelope.build(id, probe.verb, probe.args));

      const frame = await this.results.wait(id, this.timeoutMs);

      outcomes.push({ verb: probe.verb, ...answerOf(frame) });
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
  raw: string | null;
} {
  if (frame === null) {
    return { answer: 'no-reply', code: null, raw: null };
  }

  const value = frame.value;
  const code =
    isRecord(value) && isRecord(value.error)
      ? typeof value.error.code === 'string'
        ? value.error.code
        : null
      : null;

  if (isRecord(value) && value.ok === true) {
    return { answer: 'accepted', code: null, raw: frame.raw };
  }

  return {
    answer: code === 'unknown_verb' ? 'unknown-verb' : 'refused',
    code,
    raw: frame.raw,
  };
}

export function verbExists(outcome: ProbeOutcome): boolean | null {
  if (outcome.answer === 'no-reply') {
    return null;
  }

  return outcome.answer !== 'unknown-verb';
}
