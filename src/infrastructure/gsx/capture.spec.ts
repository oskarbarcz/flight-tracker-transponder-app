import { CaptureRecorder, isRecord, pathKey } from './capture';
import type { GsxFrame } from './connection';

function frame(value: unknown): GsxFrame {
  return { raw: JSON.stringify(value), value, parsed: true };
}

function recorder(): { lines: string[]; recorder: CaptureRecorder } {
  const lines: string[] = [];

  return {
    lines,
    recorder: new CaptureRecorder(
      (line) => lines.push(line),
      () => new Date('2026-08-30T12:00:00.000Z'),
    ),
  };
}

describe('pathKey', () => {
  it('reads the top-level key a patch addresses', () => {
    expect(pathKey('/services')).toBe('services');
  });

  it('refuses a path that reaches inside a key', () => {
    expect(pathKey('/services/0/state')).toBeNull();
  });

  it('refuses a path that is not a string', () => {
    expect(pathKey(undefined)).toBeNull();
    expect(pathKey(7)).toBeNull();
  });
});

describe('isRecord', () => {
  it('accepts a plain object', () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('rejects arrays and null', () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });
});

describe('CaptureRecorder', () => {
  it('writes every frame as a stamped record carrying the text verbatim', () => {
    const { lines, recorder: capture } = recorder();

    capture.record({ raw: '{"type":"hello"}', value: {}, parsed: true });

    expect(lines).toEqual([
      '{"receivedAt":"2026-08-30T12:00:00.000Z","raw":"{\\"type\\":\\"hello\\"}"}',
    ]);
  });

  it('records a frame it could not parse rather than dropping it', () => {
    const { lines, recorder: capture } = recorder();

    capture.record({ raw: '{"truncated"', value: null, parsed: false });

    expect(lines).toHaveLength(1);
    expect(capture.summary()).toMatchObject({ frames: 1, unparsed: 1 });
  });

  it('keeps the first hello and no later one', () => {
    const { recorder: capture } = recorder();

    capture.record(frame({ type: 'hello', capabilities: ['services'] }));
    capture.record(frame({ type: 'hello', capabilities: ['menu'] }));

    expect(capture.summary().hello).toBe(
      '{"type":"hello","capabilities":["services"]}',
    );
  });

  it('collects the top-level keys a snapshot carries', () => {
    const { recorder: capture } = recorder();

    capture.record(
      frame({ type: 'snapshot', services: [], airport: {}, parking: '' }),
    );

    expect(capture.summary().keys).toEqual([
      'airport',
      'parking',
      'services',
      'type',
    ]);
  });

  it('collects the key a patch addresses', () => {
    const { recorder: capture } = recorder();

    capture.record(frame({ type: 'patch', path: '/billing', value: {} }));

    expect(capture.summary().keys).toEqual(['billing']);
  });

  it('collects every service and state it has seen, from snapshots and patches', () => {
    const { recorder: capture } = recorder();

    capture.record(
      frame({
        type: 'snapshot',
        services: [
          { id: 'Boarding', state: 'available' },
          { id: 'Refueling', state: 'available' },
        ],
      }),
    );
    capture.record(
      frame({
        type: 'patch',
        path: '/services',
        value: [{ id: 'Boarding', state: 'performing' }],
      }),
    );

    expect(capture.summary()).toMatchObject({
      services: ['Boarding', 'Refueling'],
      serviceStates: ['available', 'performing'],
    });
  });

  it('survives a services collection that is not the shape it expects', () => {
    const { recorder: capture } = recorder();

    capture.record(frame({ type: 'snapshot', services: 'nothing useful' }));
    capture.record(frame({ type: 'snapshot', services: [1, null, {}] }));

    expect(capture.summary().services).toEqual([]);
  });

  it('counts every frame it was given', () => {
    const { recorder: capture } = recorder();

    capture.record(frame({ type: 'patch', path: '/menu', value: {} }));
    capture.record(frame({ type: 'patch', path: '/menu', value: {} }));

    expect(capture.summary().frames).toBe(2);
  });
});
