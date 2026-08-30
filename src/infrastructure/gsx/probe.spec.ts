import type { GsxFrame } from './connection';
import {
  answerOf,
  CONTROL_TYPE,
  controlHeld,
  Prober,
  requestFor,
  ResultWaiter,
  resultId,
  TYPE_PROBES,
  typeExists,
  UNKNOWN_SERVICE,
  UNKNOWN_TYPE_MESSAGE,
} from './probe';

function frame(value: unknown): GsxFrame {
  return { raw: JSON.stringify(value), value, parsed: true };
}

function result(id: string, body: Record<string, unknown>): GsxFrame {
  return frame({ v: 1, type: 'result', id, ...body });
}

function refusal(id: string, message: string): GsxFrame {
  return result(id, { ok: false, error: { code: 'bad_args', message } });
}

describe('the probe list', () => {
  it('leads with a type GSX cannot know, so its refusal proves the sentinel', () => {
    expect(TYPE_PROBES[0]?.type).toBe(CONTROL_TYPE);
  });

  it('asks after a service GSX cannot have, so a type that exists refuses rather than runs', () => {
    const targeted = TYPE_PROBES.filter(
      (probe) => probe.body?.id !== undefined,
    );

    expect(targeted).not.toHaveLength(0);

    for (const probe of targeted) {
      expect(probe.body?.id).toBe(UNKNOWN_SERVICE);
    }
  });

  it('never picks a menu entry, selects a gate or writes anything', () => {
    for (const probe of TYPE_PROBES) {
      expect(probe.type).not.toContain('menu.pick');
      expect(probe.type).not.toContain('gate.select');
      expect(probe.type).not.toContain('.set');
      expect(probe.type).not.toContain('.action');
    }
  });
});

describe('requestFor', () => {
  it('sends the verb as the message type, which is what GSX dispatches on', () => {
    expect(requestFor({ type: 'settings.get' }, 'probe-settings.get')).toEqual({
      v: 1,
      type: 'settings.get',
      id: 'probe-settings.get',
    });
  });

  it('spreads the body alongside the type rather than nesting it', () => {
    expect(
      requestFor({ type: 'get', body: { path: '/services' } }, 'x'),
    ).toEqual({ v: 1, type: 'get', id: 'x', path: '/services' });
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
});

describe('answerOf', () => {
  it('reads an accepted type', () => {
    expect(answerOf(result('x', { ok: true }))).toMatchObject({
      answer: 'accepted',
    });
  });

  it('reads GSX refusing a type it does not dispatch on', () => {
    expect(answerOf(refusal('x', UNKNOWN_TYPE_MESSAGE))).toMatchObject({
      answer: 'unknown-type',
      code: 'bad_args',
      message: UNKNOWN_TYPE_MESSAGE,
    });
  });

  it('reads any other complaint as the type being recognised', () => {
    expect(answerOf(refusal('x', 'missing parameter "gate"'))).toMatchObject({
      answer: 'recognised',
      message: 'missing parameter "gate"',
    });
  });

  it('reads silence', () => {
    expect(answerOf(null)).toEqual({
      answer: 'no-reply',
      code: null,
      message: null,
    });
  });
});

describe('typeExists', () => {
  it('reads a complaint about arguments as proof the type is dispatched on', () => {
    expect(
      typeExists({
        type: 'gate.list',
        answer: 'recognised',
        code: 'bad_args',
        message: 'missing gate',
      }),
    ).toBe(true);
  });

  it('reads the unknown-type refusal as proof it is not', () => {
    expect(
      typeExists({
        type: 'gate.list',
        answer: 'unknown-type',
        code: 'bad_args',
        message: UNKNOWN_TYPE_MESSAGE,
      }),
    ).toBe(false);
  });
});

describe('controlHeld', () => {
  it('holds when the control type came back as unknown', () => {
    expect(
      controlHeld([
        {
          type: CONTROL_TYPE,
          answer: 'unknown-type',
          code: 'bad_args',
          message: UNKNOWN_TYPE_MESSAGE,
        },
      ]),
    ).toBe(true);
  });

  it('fails when the control type was answered some other way, so nothing is provable', () => {
    expect(
      controlHeld([
        {
          type: CONTROL_TYPE,
          answer: 'recognised',
          code: 'bad_args',
          message: 'something else entirely',
        },
      ]),
    ).toBe(false);
  });

  it('fails when the control type was never probed', () => {
    expect(controlHeld([])).toBe(false);
  });
});

describe('ResultWaiter', () => {
  it('settles the waiter whose id the result carries', async () => {
    const waiter = new ResultWaiter();
    const waiting = waiter.wait('probe-a', 1_000);

    waiter.accept(result('probe-b', { ok: true }));
    waiter.accept(result('probe-a', { ok: true }));

    await expect(waiting).resolves.toMatchObject({ value: { id: 'probe-a' } });
  });

  it('gives up after the timeout rather than waiting forever', async () => {
    await expect(new ResultWaiter().wait('probe-a', 1)).resolves.toBeNull();
  });
});

describe('Prober', () => {
  it('probes every type and keeps GSX its own words', async () => {
    const waiter = new ResultWaiter();
    const prober = new Prober(
      (payload) => {
        const message = payload as Record<string, unknown>;
        const known = message.type === 'settings.get';

        queueMicrotask(() =>
          waiter.accept(
            refusal(
              String(message.id),
              known ? 'missing parameter "page"' : UNKNOWN_TYPE_MESSAGE,
            ),
          ),
        );
      },
      waiter,
      5,
    );

    const outcomes = await prober.run([
      { type: CONTROL_TYPE },
      { type: 'settings.get' },
      { type: 'gate.list' },
    ]);

    expect(controlHeld(outcomes)).toBe(true);
    expect(outcomes.map(typeExists)).toEqual([false, true, false]);
    expect(outcomes[1]?.message).toBe('missing parameter "page"');
  });

  it('reports silence rather than hanging when GSX never answers', async () => {
    const outcomes = await new Prober(
      () => undefined,
      new ResultWaiter(),
      1,
    ).run([{ type: 'state.get' }]);

    expect(outcomes[0]?.answer).toBe('no-reply');
  });
});
