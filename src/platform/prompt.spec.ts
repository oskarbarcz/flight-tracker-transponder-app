import {
  ConsolePrompt,
  type PromptInput,
  type PromptOutput,
  PromptCancelledError,
} from './prompt';

const BACKSPACE = '\u0008';
const DELETE = '\u007f';
const CANCEL = '\u0003';

class FakeInput implements PromptInput {
  rawModes: boolean[] = [];
  paused = false;
  private listener: ((chunk: string) => void) | null = null;

  on(_event: 'data', listener: (chunk: string) => void): unknown {
    this.listener = listener;

    return this;
  }

  off(_event: 'data', _listener: (chunk: string) => void): unknown {
    this.listener = null;

    return this;
  }

  setEncoding(_encoding: 'utf-8'): unknown {
    return this;
  }

  setRawMode(mode: boolean): unknown {
    this.rawModes.push(mode);

    return this;
  }

  resume(): unknown {
    this.paused = false;

    return this;
  }

  pause(): unknown {
    this.paused = true;

    return this;
  }

  type(chunk: string): void {
    this.listener?.(chunk);
  }

  get listening(): boolean {
    return this.listener !== null;
  }
}

class FakeOutput implements PromptOutput {
  written = '';

  write(text: string): unknown {
    this.written += text;

    return true;
  }
}

describe('ConsolePrompt', () => {
  it('returns what was typed before Enter', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const answer = new ConsolePrompt(input, output).ask('email: ');

    input.type('pilot@example.com\r');

    expect(await answer).toBe('pilot@example.com');
  });

  it('echoes a visible answer', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const answer = new ConsolePrompt(input, output).ask('email: ');

    input.type('abc\r');
    await answer;

    expect(output.written).toBe('email: abc\n');
  });

  it('masks a secret instead of echoing it', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const answer = new ConsolePrompt(input, output).askSecret('password: ');

    input.type('hunter2\r');

    expect(await answer).toBe('hunter2');
    expect(output.written).toBe('password: *******\n');
    expect(output.written).not.toContain('hunter2');
  });

  it('accepts input arriving one character at a time', async () => {
    const input = new FakeInput();
    const answer = new ConsolePrompt(input, new FakeOutput()).ask('email: ');

    for (const character of 'abc\n') {
      input.type(character);
    }

    expect(await answer).toBe('abc');
  });

  it('erases the last character on backspace', async () => {
    const input = new FakeInput();
    const answer = new ConsolePrompt(input, new FakeOutput()).ask('email: ');

    input.type(`ab${BACKSPACE}c${DELETE}d\r`);

    expect(await answer).toBe('ad');
  });

  it('ignores backspace on an empty answer', async () => {
    const input = new FakeInput();
    const answer = new ConsolePrompt(input, new FakeOutput()).ask('email: ');

    input.type(`${BACKSPACE}a\r`);

    expect(await answer).toBe('a');
  });

  it('rejects when the pilot presses ctrl-c', async () => {
    const input = new FakeInput();
    const answer = new ConsolePrompt(input, new FakeOutput()).ask('email: ');

    input.type(CANCEL);

    await expect(answer).rejects.toBeInstanceOf(PromptCancelledError);
  });

  it('leaves the terminal as it found it', async () => {
    const input = new FakeInput();
    const answer = new ConsolePrompt(input, new FakeOutput()).ask('email: ');

    input.type('a\r');
    await answer;

    expect(input.rawModes).toEqual([true, false]);
    expect(input.paused).toBe(true);
    expect(input.listening).toBe(false);
  });

  it('keeps what followed Enter for the next question', async () => {
    const input = new FakeInput();
    const prompt = new ConsolePrompt(input, new FakeOutput());
    const email = prompt.ask('email: ');

    input.type('pilot@example.com\nhunter2\n');

    expect(await email).toBe('pilot@example.com');
    expect(await prompt.askSecret('password: ')).toBe('hunter2');
  });

  it('answers both questions from a single pasted chunk', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const prompt = new ConsolePrompt(input, output);
    const email = prompt.ask('email: ');

    input.type('a@b.com\r\nhunter2\r\n');

    expect(await email).toBe('a@b.com');
    expect(await prompt.askSecret('password: ')).toBe('hunter2');
    expect(output.written).not.toContain('hunter2');
  });

  it('treats a windows line ending as one Enter', async () => {
    const input = new FakeInput();
    const prompt = new ConsolePrompt(input, new FakeOutput());
    const first = prompt.ask('first: ');

    input.type('a\r\n');
    await first;

    const second = prompt.ask('second: ');
    input.type('b\r\n');

    expect(await second).toBe('b');
  });

  it('treats a line ending split across chunks as one Enter', async () => {
    const input = new FakeInput();
    const prompt = new ConsolePrompt(input, new FakeOutput());
    const first = prompt.ask('first: ');

    input.type('a\r');
    await first;

    const second = prompt.ask('second: ');
    input.type('\nb\r');

    expect(await second).toBe('b');
  });
});
