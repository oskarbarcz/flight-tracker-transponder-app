import type { GsxFrame } from './connection';
import { decode } from './frames';

function frame(value: unknown): GsxFrame {
  return { raw: JSON.stringify(value), value, parsed: true };
}

describe('decode', () => {
  it('reads the handshake GSX actually sends', () => {
    expect(
      decode(
        frame({
          v: 1,
          type: 'hello',
          ts: 1788122080,
          protocol: 1,
          engine: 'couatl',
          sim: 'MSFS',
          gsxRunning: true,
          authRequired: false,
          capabilities: ['state', 'services', 'menu', 'gate'],
        }),
      ),
    ).toEqual({
      kind: 'hello',
      gsxRunning: true,
      capabilities: ['state', 'services', 'menu', 'gate'],
    });
  });

  it('reads a handshake with no capabilities as advertising none', () => {
    expect(decode(frame({ type: 'hello' }))).toEqual({
      kind: 'hello',
      gsxRunning: false,
      capabilities: [],
    });
  });

  it('keeps only the strings out of a capability list', () => {
    expect(
      decode(frame({ type: 'hello', capabilities: ['services', 7, null] })),
    ).toMatchObject({ capabilities: ['services'] });
  });

  it('strips the envelope off a snapshot, leaving the state', () => {
    expect(
      decode(
        frame({
          v: 1,
          type: 'snapshot',
          ts: 1788122080,
          services: [],
          parking: 'Gate 20A',
        }),
      ),
    ).toEqual({
      kind: 'snapshot',
      state: { services: [], parking: 'Gate 20A' },
    });
  });

  it('reads the top-level key a patch addresses', () => {
    expect(
      decode(frame({ type: 'patch', path: '/services', value: [1] })),
    ).toEqual({ kind: 'patch', key: 'services', value: [1] });
  });

  it('carries a null patch value through, because it means delete', () => {
    expect(
      decode(frame({ type: 'patch', path: '/prompt', value: null })),
    ).toEqual({ kind: 'patch', key: 'prompt', value: null });
  });

  it('refuses a patch that reaches inside a key', () => {
    expect(
      decode(frame({ type: 'patch', path: '/services/0/state', value: 1 })),
    ).toEqual({ kind: 'unreadable' });
  });

  it('refuses a patch with no path', () => {
    expect(decode(frame({ type: 'patch', value: 1 }))).toEqual({
      kind: 'unreadable',
    });
  });

  it('reads a result and whether it was accepted', () => {
    expect(
      decode(frame({ type: 'result', id: 'subscribe', ok: true })),
    ).toEqual({ kind: 'result', id: 'subscribe', ok: true });
    expect(
      decode(frame({ type: 'result', id: 'x', ok: false, error: {} })),
    ).toMatchObject({ ok: false });
  });

  it('reads the event shape GSX sends, with its topic', () => {
    expect(
      decode(
        frame({
          v: 1,
          type: 'event',
          ts: 1788122080,
          topic: 'startup',
          model: { active: false, bars: [], sid: 1415164388 },
        }),
      ),
    ).toEqual({ kind: 'event', topic: 'startup' });
  });

  it('discards a frame it could not parse rather than throwing', () => {
    expect(decode({ raw: '{"truncated"', value: null, parsed: false })).toEqual(
      { kind: 'unreadable' },
    );
  });

  it('discards a frame type it does not know', () => {
    expect(decode(frame({ type: 'something-new' }))).toEqual({
      kind: 'unreadable',
    });
  });

  it('discards a frame that is not an object', () => {
    expect(decode({ raw: '[]', value: [], parsed: true })).toEqual({
      kind: 'unreadable',
    });
  });
});
