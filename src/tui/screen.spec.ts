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

  it('borrows the window title and hands it back', () => {
    const out = new FakeOutput();
    const screen = new Screen(out);

    screen.start();

    expect(out.all).toContain('[22;2t');

    out.written = [];
    screen.stop();

    expect(out.all).toContain('[23;2t');
  });

  it('sets the window title', () => {
    const out = new FakeOutput();
    const screen = new Screen(out);
    screen.start();
    out.written = [];

    screen.title('SP-LOT · 12 sent');

    expect(out.all).toContain(']0;SP-LOT · 12 sent');
  });

  it('writes the title again only when it changed', () => {
    const out = new FakeOutput();
    const screen = new Screen(out);
    screen.start();
    screen.title('one');
    out.written = [];

    screen.title('one');

    expect(out.written).toEqual([]);

    screen.title('two');

    expect(out.all).toContain(']0;two');
  });

  it('strips control characters that would end the escape early', () => {
    const out = new FakeOutput();
    const screen = new Screen(out);
    screen.start();
    out.written = [];

    screen.title(`SP${String.fromCharCode(7)}${String.fromCharCode(27)}LOT`);

    expect(out.all).toContain(']0;SPLOT');
  });
});
