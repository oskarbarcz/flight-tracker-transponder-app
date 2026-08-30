import type { CaptureSummary } from './capture';
import { type ProbeOutcome, controlHeld, typeExists } from './probe';

const LABEL_WIDTH = 10;

const RULE_WIDTH = 72;

export type ReportInput = {
  file: string;
  summary: CaptureSummary;
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
    ...field(
      'pushed',
      summary.pushed === 0
        ? 'nothing — GSX sent no state of its own'
        : `${summary.pushed} frames GSX sent unasked`,
    ),
    ...field('hello', summary.hello ?? 'never sent'),
    ...field('types', list(summary.types)),
    ...field('keys', list(summary.keys)),
    ...field('services', list(summary.services)),
    ...field('states', list(summary.serviceStates)),
    ...probeLines(input.outcomes),
    rule(''),
  ];
}

function probeLines(outcomes: ProbeOutcome[]): string[] {
  if (outcomes.length === 0) {
    return field('probes', 'not run');
  }

  const width = Math.max(...outcomes.map((outcome) => outcome.type.length));
  const caveat = controlHeld(outcomes)
    ? []
    : field(
        'warning',
        'the control type was not refused as unknown — every verdict below is inconclusive',
      );

  return [
    ...caveat,
    'probes',
    ...outcomes.map((outcome) => {
      const exists = typeExists(outcome);
      const verdict = exists === null ? 'unknown' : exists ? 'KNOWN' : 'absent';
      const detail = outcome.message ?? outcome.code ?? outcome.answer;

      return `  ${outcome.type.padEnd(width)}  ${verdict.padEnd(7)}  ${detail}`;
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
