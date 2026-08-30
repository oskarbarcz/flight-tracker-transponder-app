import type { GsxFrame } from './connection';
import {
  answerOf,
  type Envelope,
  CONTROL_VERB,
  ENVELOPES,
  PROBES,
  Prober,
  ResultWaiter,
  resultId,
  UNKNOWN_SERVICE,
  verbExists,
} from './probe';

function frame(value: unknown): GsxFrame {
  return { raw: JSON.stringify(value), value, parsed: true };
}

function result(id: string, body: Record<string, unknown>): GsxFrame {
  return frame({ v: 1, type: 'result', id, ...body });
}

describe('the probe list', () => {
  it('asks after a service GSX cannot have, so a verb that exists refuses rather than runs', () => {
    const targeted = PROBES.filter((probe) => 'id' in probe.args);

    expect(targeted).not.toHaveLength(0);

    for (const probe of targeted) {
      expect(probe.args.id).toBe(UNKNOWN_SERVICE);
    }
  });

  it('never picks a menu entry', () => {
    for (const probe of PROBES) {
      expect(probe.verb).not.toContain('menu.');
    }
  });
});

describe('resultId', () => {
  it('reads the id off a result frame', () => {
    expect(resultId(result('probe-state.get', { ok: true }))).toBe(
      'probe-state.get',
    );
  });

  it('ignores a frame that is not a result', () => {
    expect(resultId(frame({ type: 'patch', id: 'probe' }))).toBeNull();
  });

  it('ignores a result with no id', () => {
    expect(resultId(frame({ type: 'result', ok: true }))).toBeNull();
  });
});

describe('answerOf', () => {
  it('reads an accepted verb', () => {
    expect(answerOf(result('x', { ok: true }))).toMatchObject({
      answer: 'accepted',
      code: null,
    });
  });

  it('reads a verb GSX does not know', () => {
    expect(
      answerOf(result('x', { ok: false, error: { code: 'unknown_verb' } })),
    ).toMatchObject({ answer: 'unknown-verb', code: 'unknown_verb' });
  });

  it('reads a verb GSX knows but refused', () => {
    expect(
      answerOf(result('x', { ok: false, error: { code: 'not_found' } })),
    ).toMatchObject({ answer: 'refused', code: 'not_found' });
  });

  it('reads silence', () => {
    expect(answerOf(null)).toEqual({
      answer: 'no-reply',
      code: null,
      raw: null,
    });
  });
});

describe('verbExists', () => {
  it('reads a refusal as proof the verb is there', () => {
    expect(
      verbExists({
        verb: 'service.trigger',
        answer: 'refused',
        code: 'not_found',
        raw: null,
      }),
    ).toBe(true);
  });

  it('reads unknown_verb as proof the verb is not', () => {
    expect(
      verbExists({
        verb: 'service.trigger',
        answer: 'unknown-verb',
        code: 'unknown_verb',
        raw: null,
      }),
    ).toBe(false);
  });

  it('answers nothing when GSX said nothing', () => {
    expect(
      verbExists({
        verb: 'service.trigger',
        answer: 'no-reply',
        code: null,
        raw: null,
      }),
    ).toBeNull();
  });
});

describe('ResultWaiter', () => {
  it('settles the waiter whose id the result carries', async () => {
    const waiter = new ResultWaiter();
    const waiting = waiter.wait('probe-a', 1_000);

    waiter.accept(result('probe-b', { ok: true }));
    waiter.accept(result('probe-a', { ok: true }));

    await expect(waiting).resolves.toMatchObject({
      value: { id: 'probe-a' },
    });
  });

  it('gives up after the timeout rather than waiting forever', async () => {
    const waiter = new ResultWaiter();

    await expect(waiter.wait('probe-a', 1)).resolves.toBeNull();
  });
});

describe('Prober', () => {
  it('settles on the first envelope GSX answers, and probes with that one', async () => {
    const sent: Record<string, unknown>[] = [];
    const waiter = new ResultWaiter();
    const answering = ENVELOPES[1]?.name;
    const prober = new Prober(
      (payload) => {
        const message = payload as Record<string, unknown>;
        sent.push(message);

        if (message.id === `probe-control-${answering}`) {
          queueMicrotask(() =>
            waiter.accept(
              result(String(message.id), {
                ok: false,
                error: { code: 'unknown_verb' },
              }),
            ),
          );
        }
      },
      waiter,
      5,
    );

    const envelope = await prober.discoverEnvelope();

    expect(envelope?.name).toBe(answering);
    expect(sent.map((message) => message.id)).toEqual(
      ENVELOPES.map((candidate) => `probe-control-${candidate.name}`).slice(
        0,
        2,
      ),
    );
  });

  it('probes with a verb GSX cannot know, so an answer proves the envelope works', () => {
    expect(CONTROL_VERB).toBe('zzz.notaverb');
  });

  it('reports no envelope when GSX answers none of them', async () => {
    const waiter = new ResultWaiter();
    const prober = new Prober(() => undefined, waiter, 1);

    await expect(prober.discoverEnvelope()).resolves.toBeNull();
  });

  it('reports one outcome per probe, in order', async () => {
    const waiter = new ResultWaiter();
    const envelope: Envelope = {
      name: 'test',
      build: (id, verb, args) => ({ id, verb, args }),
    };
    const prober = new Prober(
      (payload) => {
        const message = payload as Record<string, unknown>;

        queueMicrotask(() =>
          waiter.accept(
            result(String(message.id), {
              ok: false,
              error: { code: 'unknown_verb' },
            }),
          ),
        );
      },
      waiter,
      5,
    );

    const outcomes = await prober.run(envelope, [
      { verb: 'state.get', args: {} },
      { verb: 'gate.list', args: {} },
    ]);

    expect(outcomes.map((outcome) => outcome.verb)).toEqual([
      'state.get',
      'gate.list',
    ]);
    expect(outcomes.every((outcome) => outcome.answer === 'unknown-verb')).toBe(
      true,
    );
  });
});
