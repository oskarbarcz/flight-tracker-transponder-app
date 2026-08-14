import {
  bold,
  dim,
  green,
  hasStyle,
  toVisibleWidth,
  visibleWidth,
} from './style';

describe('colour', () => {
  const before = process.env.NO_COLOR;

  afterEach(() => {
    if (before === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = before;
    }
  });

  it('wraps the text and closes the style again', () => {
    expect(green('ok')).toContain('[32m');
    expect(green('ok')).toContain('ok');
    expect(green('ok')).toContain('[0m');
  });

  it('leaves the text alone when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';

    expect(green('ok')).toBe('ok');
    expect(bold('ok')).toBe('ok');
  });

  it('still colours when NO_COLOR is present but empty', () => {
    process.env.NO_COLOR = '';

    expect(hasStyle(green('ok'))).toBe(true);
  });
});

describe('visibleWidth', () => {
  it('counts columns rather than characters', () => {
    expect(visibleWidth(green('ok'))).toBe(2);
    expect(green('ok').length).toBeGreaterThan(2);
  });

  it('counts plain text as itself', () => {
    expect(visibleWidth('hello')).toBe(5);
  });

  it('sees through nested styles', () => {
    expect(visibleWidth(dim(green('ok')))).toBe(2);
  });
});

describe('toVisibleWidth', () => {
  it('pads to an exact number of visible columns', () => {
    expect(visibleWidth(toVisibleWidth(green('ok'), 10))).toBe(10);
  });

  it('pads plain text exactly as it always did', () => {
    expect(toVisibleWidth('ok', 5)).toBe('ok   ');
  });

  it('truncates by column, not by character', () => {
    expect(visibleWidth(toVisibleWidth(green('abcdef'), 3))).toBe(3);
    expect(toVisibleWidth(green('abcdef'), 3)).toContain('abc');
    expect(toVisibleWidth(green('abcdef'), 3)).not.toContain('abcd');
  });

  it('never slices an escape in half', () => {
    const cut = toVisibleWidth(`${green('ab')}${green('cd')}`, 3);

    // Half an escape leaves bracket-and-digit debris behind, which counts as
    // visible columns and would push this past three.
    expect(visibleWidth(cut)).toBe(3);
  });

  it('closes a style left open by truncation', () => {
    expect(toVisibleWidth(green('abcdef'), 3)).toContain('[0m');
  });

  it('does not colour the padding it adds', () => {
    const padded = toVisibleWidth(green('ok'), 6);

    expect(padded.endsWith('    ')).toBe(true);
  });

  it('survives a width of zero', () => {
    expect(visibleWidth(toVisibleWidth(green('ok'), 0))).toBe(0);
  });
});
