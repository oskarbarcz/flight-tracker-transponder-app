import { Screen } from './screen';

class FakeOutput {
  written: string[] = [];

  write(text: string): unknown {
    this.written.push(text);

    return true;
  }

  get all(): string {
    return this.written.join('');
  }
}

describe('Screen', () => {
  it('takes over the terminal and hides the cursor', () => {
    const out = new FakeOutput();

    new Screen(out).start();

    expect(out.all).toContain('[?1049h');
    expect(out.all).toContain('[?25l');
  });

  it('restores the terminal it borrowed', () => {
    const out = new FakeOutput();
    const screen = new Screen(out);
    screen.start();
    out.written = [];

    screen.stop();

    expect(out.all).toContain('[?25h');
    expect(out.all).toContain('[?1049l');
  });

  it('addresses each line by absolute row', () => {
    const out = new FakeOutput();
    const screen = new Screen(out);
    screen.start();
    out.written = [];

    screen.paint(['first', 'second']);

    expect(out.all).toContain('[1;1H');
    expect(out.all).toContain('first');
    expect(out.all).toContain('[2;1H');
    expect(out.all).toContain('second');
  });

  it('writes nothing at all when the frame has not changed', () => {
    const out = new FakeOutput();
    const screen = new Screen(out);
    screen.start();
    screen.paint(['a', 'b']);
    out.written = [];

    screen.paint(['a', 'b']);

    expect(out.written).toEqual([]);
  });

  it('repaints only the line that changed', () => {
    const out = new FakeOutput();
    const screen = new Screen(out);
    screen.start();
    screen.paint(['a', 'b', 'c']);
    out.written = [];

    screen.paint(['a', 'CHANGED', 'c']);

    expect(out.all).toContain('CHANGED');
    expect(out.all).toContain('[2;1H');
    expect(out.all).not.toContain('[1;1H');
    expect(out.all).not.toContain('[3;1H');
  });

  it('erases rows the frame no longer uses', () => {
    const out = new FakeOutput();
    const screen = new Screen(out);
    screen.start();
    screen.paint(['a', 'b', 'c']);
    out.written = [];

    screen.paint(['a']);

    expect(out.all).toContain('[2;1H');
    expect(out.all).toContain('[3;1H');
  });

  it('repaints everything after being invalidated', () => {
    const out = new FakeOutput();
    const screen = new Screen(out);
    screen.start();
    screen.paint(['a', 'b']);
    out.written = [];

    screen.invalidate();
    screen.paint(['a', 'b']);

    expect(out.all).toContain('[1;1H');
    expect(out.all).toContain('[2;1H');
  });
});
