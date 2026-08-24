import { describeError } from './supervisor';
import { type Prompt, PromptCancelledError } from './ports/prompt';

export type SignsIn = {
  signIn(email: string, password: string): Promise<void>;
};

export type SignInLogger = {
  info(message: string): void;
  error(message: string): void;
};

const ATTEMPTS = 3;

export async function promptForSignIn(
  api: SignsIn,
  prompt: Prompt,
  logger: SignInLogger,
  attempts: number = ATTEMPTS,
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let email: string;
    let password: string;

    try {
      email = (await prompt.ask('MyPreflight email: ')).trim();
      password = await prompt.askSecret('Password: ');
    } catch (error) {
      if (error instanceof PromptCancelledError) {
        logger.error('sign-in cancelled');

        return false;
      }

      throw error;
    }

    try {
      await api.signIn(email, password);
      logger.info(`signed in as ${email}`);

      return true;
    } catch (error) {
      logger.error(`sign-in failed: ${describeError(error)}`);
    }
  }

  return false;
}
