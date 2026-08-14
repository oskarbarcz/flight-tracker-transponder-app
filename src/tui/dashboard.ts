import type { StatusRegistry } from '../core/status';
import type { PromptInput } from '../platform/prompt';
import { type FramePrompt, renderFrame } from './frame';
import type { Screen } from './screen';

const REFRESH_MS = 250;
const LOG_CAPACITY = 200;
const LOGS_KEY = 'l';
const CALLSIGN_KEY = 'c';
const CANCEL = '\u0003';
const ESCAPE = '\u001b';
const ENTER = ['\r', '\n'];
const BACKSPACE = ['\u0008', '\u007f'];
const MAX_CALLSIGN = 12;

export type Columns = () => number;

export type DashboardHandlers = {
  onQuit: () => void;
  onCallsign: (callsign: string | null) => void;
};

const IGNORE: DashboardHandlers = {
  onQuit: () => undefined,
  onCallsign: () => undefined,
};

export class Dashboard {
  private readonly logs: string[] = [];
  private showLogs = false;
  private draft: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listener: ((chunk: string) => void) | null = null;
  private handlers: DashboardHandlers = IGNORE;

  constructor(
    private readonly screen: Screen,
    private readonly status: StatusRegistry,
    private readonly version: string,
    private readonly columns: Columns,
    private readonly input: PromptInput | null = null,
  ) {}

  append(line: string): void {
    this.logs.push(line);

    if (this.logs.length > LOG_CAPACITY) {
      this.logs.shift();
    }
  }

  start(handlers: DashboardHandlers): void {
    this.handlers = handlers;
    this.screen.start();
    this.render();
    this.timer = setInterval(() => this.render(), REFRESH_MS);
    this.listen();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.unlisten();
    this.screen.stop();
  }

  resize(): void {
    this.screen.invalidate();
    this.render();
  }

  toggleLogs(): void {
    this.showLogs = !this.showLogs;
    this.screen.invalidate();
    this.render();
  }

  render(): void {
    this.screen.paint(
      renderFrame({
        status: this.status.snapshot(),
        version: this.version,
        columns: this.columns(),
        logs: this.logs,
        showLogs: this.showLogs,
        prompt: this.prompt(),
      }),
    );
  }

  private prompt(): FramePrompt | null {
    return this.draft === null
      ? null
      : { label: 'callsign', value: this.draft };
  }

  private listen(): void {
    if (this.input === null) {
      return;
    }

    const listener = (chunk: string): void => {
      for (const character of chunk) {
        if (this.draft === null) {
          this.command(character);
        } else {
          this.edit(character);
        }
      }
    };

    this.input.setEncoding('utf-8');
    this.input.setRawMode?.(true);
    this.input.resume();
    this.input.on('data', listener);
    this.listener = listener;
  }

  private command(character: string): void {
    if (character === CANCEL) {
      this.handlers.onQuit();

      return;
    }

    const key = character.toLowerCase();

    if (key === LOGS_KEY) {
      this.toggleLogs();

      return;
    }

    if (key === CALLSIGN_KEY) {
      this.draft = '';
      this.render();
    }
  }

  private edit(character: string): void {
    if (character === ESCAPE || character === CANCEL) {
      this.draft = null;
      this.render();

      return;
    }

    if (ENTER.includes(character)) {
      const typed = (this.draft ?? '').trim();
      this.draft = null;
      this.handlers.onCallsign(typed === '' ? null : typed);
      this.render();

      return;
    }

    if (BACKSPACE.includes(character)) {
      this.draft = (this.draft ?? '').slice(0, -1);
      this.render();

      return;
    }

    if (!printable(character) || (this.draft ?? '').length >= MAX_CALLSIGN) {
      return;
    }

    this.draft = `${this.draft ?? ''}${character}`;
    this.render();
  }

  private unlisten(): void {
    if (this.input === null || this.listener === null) {
      return;
    }

    this.input.off('data', this.listener);
    this.input.setRawMode?.(false);
    this.listener = null;
  }
}

function printable(character: string): boolean {
  const code = character.charCodeAt(0);

  return code >= 32 && code <= 126;
}
