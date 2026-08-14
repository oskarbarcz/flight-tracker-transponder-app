// Colour, and the width arithmetic that has to survive it.
//
// An SGR escape costs four or more characters of `.length` and occupies zero
// columns, so every padding and truncation sum in the frame has to measure
// visible width instead. Doing that here keeps the rest of the frame free to
// colour anything it likes without thinking about it.

const CSI = '\u001b[';
const RESET = `${CSI}0m`;

// Deliberately only the SGR sequences this module emits. This is a ruler,
// not a terminal emulator.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the escape character is this module's whole job
const SGR = /\u001b\[[0-9;]*m/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the escape character is this module's whole job
const SGR_ALL = /\u001b\[[0-9;]*m/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the escape character is this module's whole job
const SGR_AT = /\u001b\[[0-9;]*m/y;

export type Style = (text: string) => string;

// https://no-color.org: any non-empty value turns colour off. Read per call
// rather than at import, so a test can set it without reloading the module.
function wanted(): boolean {
  return (process.env.NO_COLOR ?? '') === '';
}

function sgr(code: number): Style {
  return (text) => (wanted() ? `${CSI}${code}m${text}${RESET}` : text);
}

// The sixteen-colour palette rather than rgb, so the dashboard inherits
// whatever theme the pilot already chose for their terminal.
export const bold = sgr(1);
export const dim = sgr(2);
export const red = sgr(31);
export const green = sgr(32);
export const amber = sgr(33);
export const cyan = sgr(36);

export function visibleWidth(text: string): number {
  return text.replace(SGR_ALL, '').length;
}

export function hasStyle(text: string): boolean {
  return SGR.test(text);
}

// Pads or truncates to an exact number of visible columns. Escapes pass
// through without being counted and, crucially, without being sliced in half
// — half an escape is garbage on screen and leaves the colour running.
export function toVisibleWidth(text: string, width: number): string {
  const room = Math.max(width, 0);

  let out = '';
  let columns = 0;
  let styled = false;
  let truncated = false;
  let index = 0;

  while (index < text.length) {
    SGR_AT.lastIndex = index;
    const found = SGR_AT.exec(text);

    if (found !== null) {
      out += found[0];
      styled = true;
      index += found[0].length;

      continue;
    }

    if (columns === room) {
      truncated = true;

      break;
    }

    out += text.charAt(index);
    columns += 1;
    index += 1;
  }

  // Only a truncated line can have a style still open: every style this
  // module applies closes itself, so adding a reset otherwise just burns
  // four bytes on every repaint.
  const close = styled && truncated ? RESET : '';

  return `${out}${close}${' '.repeat(room - columns)}`;
}
