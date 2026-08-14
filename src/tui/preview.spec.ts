import { PREVIEW_COLUMNS, previewFrame } from './preview';
import { visibleWidth } from './style';

describe('previewFrame', () => {
  it('draws the box characters CI checks for', () => {
    const frame = previewFrame('0.3.0');

    for (const character of ['┌', '┐', '└', '┘', '│', '─', '═']) {
      expect(frame).toContain(character);
    }
  });

  it('shows every marker, so no colour goes unexercised', () => {
    const frame = previewFrame('0.3.0');

    for (const marker of ['●', '○', '!', '~']) {
      expect(frame).toContain(marker);
    }
  });

  it('carries colour', () => {
    expect(previewFrame('0.3.0')).toContain('[0m');
  });

  it('names the version it was built from', () => {
    expect(previewFrame('9.9.9')).toContain('v9.9.9');
  });

  it('holds its width, so a mangled line is visible as a ragged edge', () => {
    for (const line of previewFrame('0.3.0').split('\n')) {
      if (line !== '') {
        expect(visibleWidth(line)).toBe(PREVIEW_COLUMNS);
      }
    }
  });
});
