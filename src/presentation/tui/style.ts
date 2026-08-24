const CSI = '\u001b[';
const RESET = `${CSI}0m`;

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the escape character is this module's whole job
const SGR = /\u001b\[[0-9;]*m/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the escape character is this module's whole job
const SGR_ALL = /\u001b\[[0-9;]*m/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the escape character is this module's whole job
const SGR_AT = /\u001b\[[0-9;]*m/y;

export type Style = (text: string) => string;

function wanted(): boolean {
  return (process.env.NO_COLOR ?? '') === '';
}

function sgr(code: number): Style {
  return (text) => (wanted() ? `${CSI}${code}m${text}${RESET}` : text);
}

export const bold = sgr(1);
export const dim = sgr(2);
export const red = sgr(31);
export const green = sgr(32);
export const amber = sgr(33);
export const cyan = sgr(36);

export const grey = sgr(90);
export const brightCyan = sgr(96);

export const reverse = sgr(7);

export function visibleWidth(text: string): number {
  return text.replace(SGR_ALL, '').length;
}

export function hasStyle(text: string): boolean {
  return SGR.test(text);
}

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

  const close = styled && truncated ? RESET : '';

  return `${out}${close}${' '.repeat(room - columns)}`;
}
