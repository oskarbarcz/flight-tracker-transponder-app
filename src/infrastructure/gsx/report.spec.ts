import type { CaptureSummary } from './capture';
import { ENVELOPES } from './probe';
import { formatReport } from './report';

const summary: CaptureSummary = {
  hello: '{"type":"hello","capabilities":["services"]}',
  frames: 1462,
  unparsed: 0,
  keys: ['airport', 'services'],
  services: ['Boarding', 'Refueling'],
  serviceStates: ['available', 'performing'],
};

function report(
  over: Partial<Parameters<typeof formatReport>[0]> = {},
): string {
  return formatReport({
    file: 'C:\\gsx\\gsx-capture.jsonl',
    summary,
    envelope: ENVELOPES[0] ?? null,
    outcomes: [],
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

  it('shows the envelope shape that worked', () => {
    expect(report()).toContain('"verb":"<verb>"');
  });

  it('warns that the probes mean nothing when no envelope answered', () => {
    expect(report({ envelope: null })).toContain('inconclusive');
  });

  it('says whether each probed verb exists', () => {
    const text = report({
      outcomes: [
        {
          verb: 'service.trigger',
          answer: 'refused',
          code: 'not_found',
          raw: null,
        },
        {
          verb: 'gate.list',
          answer: 'unknown-verb',
          code: 'unknown_verb',
          raw: null,
        },
        { verb: 'state.get', answer: 'no-reply', code: null, raw: null },
      ],
    });

    expect(text).toContain('service.trigger  exists');
    expect(text).toContain('gate.list        absent');
    expect(text).toContain('state.get        unknown');
  });

  it('says the probes were not run rather than showing an empty table', () => {
    expect(report({ outcomes: [] })).toContain('not run');
  });

  it('wraps a long line rather than running off the console', () => {
    const long = Array.from({ length: 40 }, (_, index) => `key${index}`);
    const lines = formatReport({
      file: 'x',
      summary: { ...summary, keys: long },
      envelope: null,
      outcomes: [],
    });

    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(72);
    }
  });
});
