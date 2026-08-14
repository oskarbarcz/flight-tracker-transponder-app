import type { PromptOutput } from '../platform/prompt';

const ALTERNATE_ON = '\u001b[?1049h';
const ALTERNATE_OFF = '\u001b[?1049l';
const CURSOR_HIDE = '\u001b[?25l';
const CURSOR_SHOW = '\u001b[?25h';
const ERASE_LINE = '\u001b[2K';

function moveTo(row: number): string {
  return `\u001b[${row};1H`;
}

export class Screen {
  private painted: string[] = [];

  constructor(private readonly out: PromptOutput) {}

  start(): void {
    this.painted = [];
    this.out.write(`${ALTERNATE_ON}${CURSOR_HIDE}`);
  }

  invalidate(): void {
    this.painted = [];
  }

  paint(lines: string[]): void {
    let frame = '';

    for (const [index, line] of lines.entries()) {
      if (this.painted[index] === line) {
        continue;
      }

      frame += `${moveTo(index + 1)}${ERASE_LINE}${line}`;
    }

    for (let index = lines.length; index < this.painted.length; index += 1) {
      frame += `${moveTo(index + 1)}${ERASE_LINE}`;
    }

    this.painted = [...lines];

    if (frame !== '') {
      this.out.write(frame);
    }
  }

  stop(): void {
    this.painted = [];
    this.out.write(`${CURSOR_SHOW}${ALTERNATE_OFF}`);
  }
}
