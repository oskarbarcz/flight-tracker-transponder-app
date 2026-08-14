import type { StatusRegistry } from '../core/status';
import type { PromptInput } from '../platform/prompt';
import { type FramePrompt, renderFrame, renderTitle } from './frame';
import type { Screen } from './screen';

const REFRESH_MS = 250;
const LOG_CAPACITY = 200;
const DEBUG_KEY = 'd';
const CALLSIGN_KEY = 'c';
const SESSION_KEY = 's';
const TRANSMIT_KEY = 't';
const CANCEL = '\u0003';
const ESCAPE = '\u001b';
const ENTER = ['\r', '\n'];
const BACKSPACE = ['\u0008', '\u007f'];
const MAX_CALLSIGN = 12;
const MAX_CREDENTIAL = 128;

export type Columns = () => number;

export type DashboardHandlers = {
  onQuit: () => void;
  onCallsign: (callsign: string | null) => void;
  onSignIn: (email: string, password: string) => void;
  onSignOut: () => void;
  onTransmit: () => void;
};

const IGNORE: DashboardHandlers = {
  onQuit: () => undefined,
  onCallsign: () => undefined,
  onSignIn: () => undefined,
  onSignOut: () => undefined,
  onTransmit: () => undefined,
};

// One line of the frame, borrowed for one answer. A password is the reason the
// masking and the length live here rather than in the caller: the frame paints
// what it is handed, and it should never be handed a password.
type Field = {
  label: string;
  hint: string;
  masked: boolean;
  maxLength: number;
  submit: (value: string) => void;
};

export class Dashboard {
  private readonly logs: string[] = [];
  private showLogs = false;
  private field: Field | null = null;
  private draft = '';
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

  // For the outcome of something the pilot just asked for. A sign-in that
  // failed silently is indistinguishable from one that was never offered, and
  // the reason is already written to the pane — it just is not being looked at.
  revealLogs(): void {
    if (this.showLogs) {
      this.render();

      return;
    }

    this.toggleLogs();
  }

  render(): void {
    const status = this.status.snapshot();

    // Screen swallows a title it has already set, so this costs a write only
    // when something the pilot would notice has actually moved.
    this.screen.title(renderTitle(status));
    this.screen.paint(
      renderFrame({
        status,
        version: this.version,
        columns: this.columns(),
        logs: this.logs,
        showLogs: this.showLogs,
        prompt: this.prompt(),
      }),
    );
  }

  private prompt(): FramePrompt | null {
    const field = this.field;

    if (field === null) {
      return null;
    }

    return {
      label: field.label,
      value: field.masked ? '*'.repeat(this.draft.length) : this.draft,
      hint: field.hint,
    };
  }

  private ask(field: Field): void {
    this.field = field;
    this.draft = '';
    this.render();
  }

  private askCallsign(): void {
    this.ask({
      label: 'callsign',
      hint: 'enter to set · empty follows the flight · esc cancels',
      masked: false,
      maxLength: MAX_CALLSIGN,
      submit: (typed) => this.handlers.onCallsign(typed === '' ? null : typed),
    });
  }

  // Two fields, one after the other, because the frame has one line to spare
  // and a pilot who is signing in is not doing anything else.
  private askSignIn(): void {
    this.ask({
      label: 'email',
      hint: 'enter for the password · esc cancels',
      masked: false,
      maxLength: MAX_CREDENTIAL,
      submit: (email) => {
        if (email === '') {
          return;
        }

        this.ask({
          label: 'password',
          hint: 'enter signs in · esc cancels',
          masked: true,
          maxLength: MAX_CREDENTIAL,
          submit: (password) => this.handlers.onSignIn(email, password),
        });
      },
    });
  }

  // One key, two meanings, taken from the state the frame is already showing so
  // that pressing it does what the bottom line says it will. Signing out while
  // the transponder is transmitting would strand a flight halfway through its
  // track, so there it does nothing — which is what the greyed-out label means.
  private session(): void {
    const status = this.status.snapshot();

    if (status.crew === null) {
      this.askSignIn();

      return;
    }

    if (status.transmitting) {
      return;
    }

    this.handlers.onSignOut();
    this.render();
  }

  private listen(): void {
    if (this.input === null) {
      return;
    }

    const listener = (chunk: string): void => {
      for (const character of chunk) {
        if (this.field === null) {
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

    if (key === DEBUG_KEY) {
      this.toggleLogs();

      return;
    }

    if (key === CALLSIGN_KEY) {
      this.askCallsign();

      return;
    }

    if (key === SESSION_KEY) {
      this.session();

      return;
    }

    if (key === TRANSMIT_KEY) {
      this.handlers.onTransmit();
      this.render();
    }
  }

  private edit(character: string): void {
    if (character === ESCAPE || character === CANCEL) {
      this.field = null;
      this.draft = '';
      this.render();

      return;
    }

    if (ENTER.includes(character)) {
      const field = this.field;
      // A password is taken exactly as typed; everything else is trimmed,
      // because a trailing space in a callsign is a typo and in a password it
      // is a character.
      const typed = field?.masked === true ? this.draft : this.draft.trim();

      this.field = null;
      this.draft = '';
      field?.submit(typed);
      this.render();

      return;
    }

    if (BACKSPACE.includes(character)) {
      this.draft = this.draft.slice(0, -1);
      this.render();

      return;
    }

    if (
      !printable(character) ||
      this.draft.length >= (this.field?.maxLength ?? MAX_CALLSIGN)
    ) {
      return;
    }

    this.draft = `${this.draft}${character}`;
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

// Anything that is not a control character. Narrower than that used to mean a
// pilot whose password has an accent in it could not type it and would never
// be told why; the escapes that would smear the frame are all below space.
function printable(character: string): boolean {
  const code = character.charCodeAt(0);

  return code >= 32 && code !== 127;
}
