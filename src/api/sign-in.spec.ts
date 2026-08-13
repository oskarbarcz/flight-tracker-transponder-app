import { type Prompt, PromptCancelledError } from '../platform/prompt';
import { promptForSignIn, type SignInLogger, type SignsIn } from './sign-in';

function scriptedPrompt(answers: string[], secrets: string[]): Prompt {
  return {
    ask: () => Promise.resolve(answers.shift() ?? ''),
    askSecret: () => Promise.resolve(secrets.shift() ?? ''),
  };
}

function recordingLogger(): SignInLogger & { lines: string[] } {
  const lines: string[] = [];

  return {
    lines,
    info: (message) => lines.push(message),
    error: (message) => lines.push(message),
  };
}

describe('promptForSignIn', () => {
  it('signs in with what the pilot typed', async () => {
    const attempts: [string, string][] = [];
    const api: SignsIn = {
      signIn: (email, password) => {
        attempts.push([email, password]);

        return Promise.resolve();
      },
    };

    const signedIn = await promptForSignIn(
      api,
      scriptedPrompt(['pilot@example.com'], ['hunter2']),
      recordingLogger(),
    );

    expect(signedIn).toBe(true);
    expect(attempts).toEqual([['pilot@example.com', 'hunter2']]);
  });

  it('trims a pasted email', async () => {
    const attempts: string[] = [];
    const api: SignsIn = {
      signIn: (email) => {
        attempts.push(email);

        return Promise.resolve();
      },
    };

    await promptForSignIn(
      api,
      scriptedPrompt(['  pilot@example.com  '], ['hunter2']),
      recordingLogger(),
    );

    expect(attempts).toEqual(['pilot@example.com']);
  });

  it('asks again when the credentials are rejected', async () => {
    let calls = 0;
    const api: SignsIn = {
      signIn: () => {
        calls += 1;

        return calls === 1
          ? Promise.reject(new Error('401'))
          : Promise.resolve();
      },
    };

    const signedIn = await promptForSignIn(
      api,
      scriptedPrompt(['wrong@example.com', 'right@example.com'], ['a', 'b']),
      recordingLogger(),
    );

    expect(signedIn).toBe(true);
    expect(calls).toBe(2);
  });

  it('gives up after the allowed attempts', async () => {
    let calls = 0;
    const api: SignsIn = {
      signIn: () => {
        calls += 1;

        return Promise.reject(new Error('401'));
      },
    };

    const signedIn = await promptForSignIn(
      api,
      scriptedPrompt(['a', 'b', 'c'], ['1', '2', '3']),
      recordingLogger(),
      3,
    );

    expect(signedIn).toBe(false);
    expect(calls).toBe(3);
  });

  it('stops when the pilot cancels', async () => {
    let calls = 0;
    const api: SignsIn = {
      signIn: () => {
        calls += 1;

        return Promise.resolve();
      },
    };
    const prompt: Prompt = {
      ask: () => Promise.reject(new PromptCancelledError()),
      askSecret: () => Promise.resolve(''),
    };

    expect(await promptForSignIn(api, prompt, recordingLogger())).toBe(false);
    expect(calls).toBe(0);
  });

  it('never writes the password to the log', async () => {
    const logger = recordingLogger();
    const api: SignsIn = {
      signIn: () => Promise.reject(new Error('rejected')),
    };

    await promptForSignIn(
      api,
      scriptedPrompt(['pilot@example.com'], ['hunter2']),
      logger,
      1,
    );

    expect(logger.lines.join('\n')).not.toContain('hunter2');
  });

  it('names the pilot it signed in', async () => {
    const logger = recordingLogger();
    const api: SignsIn = { signIn: () => Promise.resolve() };

    await promptForSignIn(
      api,
      scriptedPrompt(['pilot@example.com'], ['hunter2']),
      logger,
    );

    expect(logger.lines).toContain('signed in as pilot@example.com');
  });
});
