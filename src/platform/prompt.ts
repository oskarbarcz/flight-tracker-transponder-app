export type PromptInput = {
  on(event: 'data', listener: (chunk: string) => void): unknown;
  off(event: 'data', listener: (chunk: string) => void): unknown;
  setEncoding(encoding: 'utf-8'): unknown;
  setRawMode?(mode: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
};

export type PromptOutput = {
  write(text: string): unknown;
};

export interface Prompt {
  ask(question: string): Promise<string>;
  askSecret(question: string): Promise<string>;
}

export class PromptCancelledError extends Error {
  constructor() {
    super('The pilot cancelled the prompt.');
  }
}

const CARRIAGE_RETURN = '\r';
const LINE_FEED = '\n';
const BACKSPACE = ['\u0008', '\u007f'];
const CANCEL = '\u0003';
const ERASE = '\u0008 \u0008';

type Consumed = {
  complete: boolean;
  cancelled: boolean;
  rest: string;
};

export class ConsolePrompt implements Prompt {
  private pending = '';
  private skipLineFeed = false;

  constructor(
    private readonly input: PromptInput,
    private readonly output: PromptOutput,
  ) {}

  ask(question: string): Promise<string> {
    return this.read(question, false);
  }

  askSecret(question: string): Promise<string> {
    return this.read(question, true);
  }

  private read(question: string, hidden: boolean): Promise<string> {
    this.output.write(question);

    const typed: string[] = [];
    const buffered = this.pending;
    this.pending = '';
    const fromBuffer = this.consume(typed, buffered, hidden);

    if (fromBuffer.complete) {
      this.pending = fromBuffer.rest;
      this.output.write(LINE_FEED);

      return fromBuffer.cancelled
        ? Promise.reject(new PromptCancelledError())
        : Promise.resolve(typed.join(''));
    }

    this.input.setEncoding('utf-8');
    this.input.setRawMode?.(true);
    this.input.resume();

    return new Promise<string>((resolve, reject) => {
      const listener = (chunk: string): void => {
        const result = this.consume(typed, chunk, hidden);

        if (!result.complete) {
          return;
        }

        this.pending = result.rest;
        this.stop(listener);

        if (result.cancelled) {
          reject(new PromptCancelledError());

          return;
        }

        resolve(typed.join(''));
      };

      this.input.on('data', listener);
    });
  }

  private consume(typed: string[], chunk: string, hidden: boolean): Consumed {
    for (let index = 0; index < chunk.length; index += 1) {
      const character = chunk[index] as string;

      if (this.skipLineFeed) {
        this.skipLineFeed = false;

        if (character === LINE_FEED) {
          continue;
        }
      }

      if (character === CARRIAGE_RETURN || character === LINE_FEED) {
        const skip =
          character === CARRIAGE_RETURN && chunk[index + 1] === LINE_FEED
            ? 2
            : 1;

        if (character === CARRIAGE_RETURN && skip === 1) {
          this.skipLineFeed = true;
        }

        return {
          complete: true,
          cancelled: false,
          rest: chunk.slice(index + skip),
        };
      }

      if (character === CANCEL) {
        return {
          complete: true,
          cancelled: true,
          rest: chunk.slice(index + 1),
        };
      }

      if (BACKSPACE.includes(character)) {
        if (typed.pop() !== undefined) {
          this.output.write(ERASE);
        }

        continue;
      }

      typed.push(character);
      this.output.write(hidden ? '*' : character);
    }

    return { complete: false, cancelled: false, rest: '' };
  }

  private stop(listener: (chunk: string) => void): void {
    this.input.off('data', listener);
    this.input.setRawMode?.(false);
    this.input.pause();
    this.output.write(LINE_FEED);
  }
}
