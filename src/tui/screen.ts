import type { PromptOutput } from '../platform/prompt';

const ALTERNATE_ON = '\u001b[?1049h';
const ALTERNATE_OFF = '\u001b[?1049l';
const CURSOR_HIDE = '\u001b[?25l';
const CURSOR_SHOW = '\u001b[?25h';
const ERASE_LINE = '\u001b[2K';

// The window title lives on a small stack, so the shell gets its own title
// back on the way out. Terminals that keep no stack ignore both of these and
// simply hold the last title we set.
const TITLE_PUSH = '\u001b[22;2t';
const TITLE_POP = '\u001b[23;2t';

function moveTo(row: number): string {
  return `\u001b[${row};1H`;
}

function setTitle(text: string): string {
  return `\u001b]0;${text}\u0007`;
}

// A stray BEL or ESC would close the escape early and spray the rest of the
// title across the frame. Callsigns already arrive filtered, so this only
// guards a future caller.
function printableOnly(text: string): string {
  return [...text]
    .filter((character) => character >= ' ' && character !== '\u007f')
    .join('');
}

export class Screen {
  private painted: string[] = [];
  private titled: string | null = null;

  constructor(private readonly out: PromptOutput) {}

  start(): void {
    this.painted = [];
    this.titled = null;
    this.out.write(`${ALTERNATE_ON}${CURSOR_HIDE}${TITLE_PUSH}`);
  }

  title(text: string): void {
    const wanted = printableOnly(text);

    if (this.titled === wanted) {
      return;
    }

    this.titled = wanted;
    this.out.write(setTitle(wanted));
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
    this.titled = null;
    this.out.write(`${CURSOR_SHOW}${ALTERNATE_OFF}${TITLE_POP}`);
  }
}
