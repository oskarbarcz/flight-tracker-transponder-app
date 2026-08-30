import type { CaptureSummary } from './capture';
import { CONTROL_TYPE, UNKNOWN_TYPE_MESSAGE } from './probe';
import { formatReport } from './report';

const summary: CaptureSummary = {
  hello: '{"type":"hello","capabilities":["services"]}',
  frames: 1462,
  unparsed: 0,
  pushed: 1440,
  types: ['hello', 'patch', 'snapshot'],
  keys: ['airport', 'services'],
  services: ['Boarding', 'Refueling'],
  serviceStates: ['available', 'performing'],
};

const held = {
  type: CONTROL_TYPE,
  answer: 'unknown-type' as const,
  code: 'bad_args',
  message: UNKNOWN_TYPE_MESSAGE,
};

function report(
  over: Partial<Parameters<typeof formatReport>[0]> = {},
): string {
  return formatReport({
    file: 'C:\\gsx\\gsx-capture.jsonl',
    summary,
    outcomes: [held],
    ...over,
  }).join('\n');
}

describe('formatReport', () => {
  it('names the file the frames went to', () => {
    expect(report()).toContain('C:\\gsx\\gsx-capture.jsonl');
  });

  it('carries the hello frame verbatim, so it can be pasted back', () => {
    expect(report()).toContain('{"type":"hello","capabilities":["services"]}');
  });

  it('says so when GSX never sent a hello', () => {
    expect(report({ summary: { ...summary, hello: null } })).toContain(
      'never sent',
    );
  });

  it('counts unreadable frames only when there were some', () => {
    expect(report()).toContain('1462');
    expect(report()).not.toContain('unreadable');
    expect(report({ summary: { ...summary, unparsed: 3 } })).toContain(
      '1462 (3 unreadable)',
    );
  });

  it('lists the keys, services and states that were seen', () => {
    const text = report();

    expect(text).toContain('airport, services');
    expect(text).toContain('Boarding, Refueling');
    expect(text).toContain('available, performing');
  });

  it('says nothing was seen rather than printing an empty list', () => {
    expect(
      report({
        summary: { ...summary, services: [], keys: [], serviceStates: [] },
      }),
    ).toContain('none seen');
  });

  it('says whether GSX pushed any state of its own', () => {
    expect(report()).toContain('1440 frames GSX sent unasked');
    expect(report({ summary: { ...summary, pushed: 0 } })).toContain(
      'GSX sent no state of its own',
    );
  });

  it('lists the frame types that arrived', () => {
    expect(report()).toContain('hello, patch, snapshot');
  });

  it('says whether each probed type is dispatched on', () => {
    const text = report({
      outcomes: [
        held,
        {
          type: 'settings.get',
          answer: 'recognised',
          code: 'bad_args',
          message: 'missing parameter "page"',
        },
        {
          type: 'gate.list',
          answer: 'unknown-type',
          code: 'bad_args',
          message: UNKNOWN_TYPE_MESSAGE,
        },
        { type: 'state.get', answer: 'no-reply', code: null, message: null },
      ],
    });

    expect(text).toContain('settings.get  KNOWN');
    expect(text).toContain('gate.list     absent');
    expect(text).toContain('state.get     unknown');
  });

  it('keeps GSX its own wording, which is what says why a type was refused', () => {
    expect(
      report({
        outcomes: [
          held,
          {
            type: 'gate.select',
            answer: 'recognised',
            code: 'bad_args',
            message: 'missing parameter "gate"',
          },
        ],
      }),
    ).toContain('missing parameter "gate"');
  });

  it('calls every verdict inconclusive when the control type was not refused', () => {
    expect(
      report({
        outcomes: [
          {
            type: CONTROL_TYPE,
            answer: 'recognised',
            code: 'bad_args',
            message: 'something else',
          },
        ],
      }),
    ).toContain('inconclusive');
  });

  it('says nothing about inconclusiveness when the control type held', () => {
    expect(report()).not.toContain('inconclusive');
  });

  it('says the probes were not run rather than showing an empty table', () => {
    expect(report({ outcomes: [] })).toContain('not run');
  });

  it('wraps a long line rather than running off the console', () => {
    const long = Array.from({ length: 40 }, (_, index) => `key${index}`);
    const lines = formatReport({
      file: 'x',
      summary: { ...summary, keys: long },
      outcomes: [held],
    });

    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(72);
    }
  });
});
