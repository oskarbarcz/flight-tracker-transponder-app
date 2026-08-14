import { StatusRegistry } from '../core/status';
import type { PromptInput } from '../platform/prompt';
import { Dashboard, type DashboardHandlers } from './dashboard';
import { Screen } from './screen';

const CANCEL = '\u0003';
const ESCAPE = '\u001b';
const BACKSPACE = '\u007f';

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

class FakeInput implements PromptInput {
  rawModes: boolean[] = [];
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
    return this;
  }

  pause(): unknown {
    return this;
  }

  press(key: string): void {
    this.listener?.(key);
  }

  get listening(): boolean {
    return this.listener !== null;
  }
}

function dashboard(): {
  out: FakeOutput;
  input: FakeInput;
  status: StatusRegistry;
  view: Dashboard;
} {
  const out = new FakeOutput();
  const input = new FakeInput();
  const status = new StatusRegistry();

  return {
    out,
    input,
    status,
    view: new Dashboard(new Screen(out), status, '0.3.0', () => 80, input),
  };
}

function handlers(
  overrides: Partial<DashboardHandlers> = {},
): DashboardHandlers {
  return {
    onQuit: () => undefined,
    onCallsign: () => undefined,
    onSignIn: () => undefined,
    onSignOut: () => undefined,
    onTransmit: () => undefined,
    ...overrides,
  };
}

function type(input: FakeInput, text: string): void {
  for (const character of text) {
    input.press(character);
  }
}

describe('Dashboard', () => {
  it('paints as soon as it starts', () => {
    const { out, view } = dashboard();

    view.start(handlers());
    view.stop();

    expect(out.all).toContain('FLIGHT TRACKER');
  });

  it('quits on ctrl-c, which raw mode stops delivering as a signal', () => {
    const { input, view } = dashboard();
    let quit = 0;

    view.start(
      handlers({
        onQuit: () => {
          quit += 1;
        },
      }),
    );
    input.press(CANCEL);
    view.stop();

    expect(quit).toBe(1);
  });

  it('asks for a callsign when c is pressed', () => {
    const { out, input, view } = dashboard();
    view.start(handlers());
    out.written = [];

    input.press('c');
    view.stop();

    expect(out.all).toContain('callsign ›');
  });

  it('reports the callsign that was typed', () => {
    const { input, view } = dashboard();
    const typed: (string | null)[] = [];

    view.start(handlers({ onCallsign: (value) => typed.push(value) }));
    input.press('c');

    for (const character of 'SP123') {
      input.press(character);
    }

    input.press('\r');
    view.stop();

    expect(typed).toEqual(['SP123']);
  });

  it('takes an empty answer as following the flight again', () => {
    const { input, view } = dashboard();
    const typed: (string | null)[] = [];

    view.start(handlers({ onCallsign: (value) => typed.push(value) }));
    input.press('c');
    input.press('\r');
    view.stop();

    expect(typed).toEqual([null]);
  });

  it('lets escape cancel without changing anything', () => {
    const { input, view } = dashboard();
    const typed: (string | null)[] = [];

    view.start(handlers({ onCallsign: (value) => typed.push(value) }));
    input.press('c');
    input.press('S');
    input.press(ESCAPE);
    input.press('\r');
    view.stop();

    expect(typed).toEqual([]);
  });

  it('does not quit on ctrl-c while a callsign is being typed', () => {
    const { input, view } = dashboard();
    let quit = 0;

    view.start(
      handlers({
        onQuit: () => {
          quit += 1;
        },
      }),
    );
    input.press('c');
    input.press(CANCEL);
    view.stop();

    expect(quit).toBe(0);
  });

  it('edits the draft with backspace', () => {
    const { input, view } = dashboard();
    const typed: (string | null)[] = [];

    view.start(handlers({ onCallsign: (value) => typed.push(value) }));
    input.press('c');

    for (const character of 'SP9') {
      input.press(character);
    }

    input.press(BACKSPACE);
    input.press('1');
    input.press('\r');
    view.stop();

    expect(typed).toEqual(['SP1']);
  });

  it('treats a command key as text while typing a callsign', () => {
    const { input, view } = dashboard();
    const typed: (string | null)[] = [];

    view.start(handlers({ onCallsign: (value) => typed.push(value) }));
    input.press('c');

    for (const character of 'LOT1') {
      input.press(character);
    }

    input.press('\r');
    view.stop();

    expect(typed).toEqual(['LOT1']);
  });

  it('shows and hides the debug pane on the toggle key', () => {
    const { out, input, view } = dashboard();
    view.start(handlers());
    view.append('20:14:22 WARN  something happened');

    input.press('d');
    const shown = out.all;
    out.written = [];
    input.press('d');
    const hidden = out.all;
    view.stop();

    expect(shown).toContain('something happened');
    expect(hidden).not.toContain('something happened');
  });

  it('accepts the debug key in upper case too', () => {
    const { out, input, view } = dashboard();
    view.start(handlers());
    view.append('a log line');
    out.written = [];

    input.press('D');
    view.stop();

    expect(out.all).toContain('a log line');
  });

  it('ignores keys it has no use for', () => {
    const { out, input, view } = dashboard();
    view.start(handlers());
    view.append('a log line');
    out.written = [];

    input.press('x');
    view.stop();

    expect(out.all).not.toContain('a log line');
  });

  it('keeps collecting logs while the pane is hidden', () => {
    const { out, input, view } = dashboard();
    view.start(handlers());
    view.append('earlier line');
    out.written = [];

    input.press('d');
    view.stop();

    expect(out.all).toContain('earlier line');
  });

  it('leaves raw mode and the terminal as it found them', () => {
    const { out, input, view } = dashboard();

    view.start(handlers());
    out.written = [];
    view.stop();

    expect(input.rawModes).toEqual([true, false]);
    expect(input.listening).toBe(false);
    expect(out.all).toContain('[?1049l');
  });

  it('asks for an email and then a masked password on s', () => {
    const { out, input, view } = dashboard();
    const attempts: [string, string][] = [];

    view.start(
      handlers({
        onSignIn: (email, password) => attempts.push([email, password]),
      }),
    );

    input.press('s');
    expect(out.all).toContain('email ›');

    type(input, 'pilot@example.com');
    input.press('\r');
    out.written = [];

    type(input, 'P@$$w0rd');
    const asking = out.all;
    input.press('\r');
    view.stop();

    expect(asking).toContain('password ›');
    expect(asking).not.toContain('P@$$w0rd');
    expect(asking).toContain('*'.repeat('P@$$w0rd'.length));
    expect(attempts).toEqual([['pilot@example.com', 'P@$$w0rd']]);
  });

  it('never trims a password, and never writes one to the frame', () => {
    const { out, input, view } = dashboard();
    const attempts: [string, string][] = [];

    view.start(
      handlers({
        onSignIn: (email, password) => attempts.push([email, password]),
      }),
    );

    input.press('s');
    type(input, '  pilot@example.com  ');
    input.press('\r');
    type(input, ' spaced ');
    input.press('\r');
    view.stop();

    expect(attempts).toEqual([['pilot@example.com', ' spaced ']]);
    expect(out.all).not.toContain('spaced');
  });

  it('lets a password with an accent in it be typed at all', () => {
    const { input, view } = dashboard();
    const attempts: [string, string][] = [];

    view.start(
      handlers({
        onSignIn: (email, password) => attempts.push([email, password]),
      }),
    );

    input.press('s');
    type(input, 'pilot@example.com');
    input.press('\r');
    type(input, 'grüß');
    input.press('\r');
    view.stop();

    expect(attempts).toEqual([['pilot@example.com', 'grüß']]);
  });

  it('abandons the sign-in when the email is left empty', () => {
    const { input, view } = dashboard();
    let asked = 0;

    view.start(
      handlers({
        onSignIn: () => {
          asked += 1;
        },
      }),
    );

    input.press('s');
    input.press('\r');
    input.press('\r');
    view.stop();

    expect(asked).toBe(0);
  });

  it('lets escape out of the password without signing in', () => {
    const { input, view } = dashboard();
    let asked = 0;

    view.start(
      handlers({
        onSignIn: () => {
          asked += 1;
        },
      }),
    );

    input.press('s');
    type(input, 'pilot@example.com');
    input.press('\r');
    type(input, 'secret');
    input.press(ESCAPE);
    view.stop();

    expect(asked).toBe(0);
  });

  it('asks to toggle transmission on t', () => {
    const { input, view } = dashboard();
    let toggles = 0;

    view.start(
      handlers({
        onTransmit: () => {
          toggles += 1;
        },
      }),
    );

    input.press('t');
    input.press('T');
    view.stop();

    expect(toggles).toBe(2);
  });

  it('takes t and s as text while a callsign is being typed', () => {
    const { input, view } = dashboard();
    const typed: (string | null)[] = [];
    let toggles = 0;

    view.start(
      handlers({
        onCallsign: (value) => typed.push(value),
        onTransmit: () => {
          toggles += 1;
        },
      }),
    );

    input.press('c');
    type(input, 'TS12');
    input.press('\r');
    view.stop();

    expect(typed).toEqual(['TS12']);
    expect(toggles).toBe(0);
  });

  it('reveals the log pane so an answer the pilot waited for is seen', () => {
    const { out, view } = dashboard();

    view.start(handlers());
    view.append('sign-in failed: wrong password');
    out.written = [];

    view.revealLogs();
    const revealed = out.all;

    // Already open: revealing again must not close it, which a plain toggle
    // would have done.
    view.append('and here is why');
    out.written = [];
    view.revealLogs();
    view.stop();

    expect(revealed).toContain('sign-in failed');
    expect(out.all).toContain('and here is why');
  });

  it('reflects status changes on the next render', () => {
    const { out, status, view } = dashboard();
    view.start(handlers());
    out.written = [];

    status.set('simulator', 'connected');
    view.render();
    view.stop();

    expect(out.all).toContain('connected');
  });
});
