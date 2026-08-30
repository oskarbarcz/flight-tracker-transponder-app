import type { CaptureSummary } from './capture';
import type { Envelope, ProbeOutcome } from './probe';
import { verbExists } from './probe';

const LABEL_WIDTH = 10;

const RULE_WIDTH = 72;

export type ReportInput = {
  file: string;
  summary: CaptureSummary;
  envelope: Envelope | null;
  outcomes: ProbeOutcome[];
};

export function formatReport(input: ReportInput): string[] {
  const summary = input.summary;

  return [
    rule('GSX capture summary'),
    ...field('file', input.file),
    ...field(
      'frames',
      summary.unparsed === 0
        ? `${summary.frames}`
        : `${summary.frames} (${summary.unparsed} unreadable)`,
    ),
    ...field('hello', summary.hello ?? 'never sent'),
    ...field('keys', list(summary.keys)),
    ...field('services', list(summary.services)),
    ...field('states', list(summary.serviceStates)),
    ...field('envelope', envelopeLine(input.envelope)),
    ...probeLines(input.outcomes),
    rule(''),
  ];
}

function envelopeLine(envelope: Envelope | null): string {
  if (envelope === null) {
    return 'none answered — every probe below is inconclusive';
  }

  return `${envelope.name} ${JSON.stringify(envelope.build('<id>', '<verb>', {}))}`;
}

function probeLines(outcomes: ProbeOutcome[]): string[] {
  if (outcomes.length === 0) {
    return field('probes', 'not run');
  }

  const width = Math.max(...outcomes.map((outcome) => outcome.verb.length));

  return [
    'probes',
    ...outcomes.map((outcome) => {
      const exists = verbExists(outcome);
      const verdict =
        exists === null ? 'unknown' : exists ? 'exists' : 'absent';

      return `  ${outcome.verb.padEnd(width)}  ${verdict.padEnd(7)}  ${outcome.code ?? outcome.answer}`;
    }),
  ];
}

function field(label: string, value: string): string[] {
  const [first, ...rest] = wrap(value, RULE_WIDTH - LABEL_WIDTH);

  return [
    `${label.padEnd(LABEL_WIDTH)}${first ?? ''}`,
    ...rest.map((line) => `${' '.repeat(LABEL_WIDTH)}${line}`),
  ];
}

function list(values: string[]): string {
  return values.length === 0 ? 'none seen' : values.join(', ');
}

function wrap(value: string, width: number): string[] {
  const lines: string[] = [];

  for (let index = 0; index < value.length; index += width) {
    lines.push(value.slice(index, index + width));
  }

  return lines.length === 0 ? [''] : lines;
}

function rule(title: string): string {
  const head = title === '' ? '' : ` ${title} `;

  return `${'─'.repeat(3)}${head}${'─'.repeat(Math.max(RULE_WIDTH - 3 - head.length, 0))}`;
}
