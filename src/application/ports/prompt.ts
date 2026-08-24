export interface Prompt {
  ask(question: string): Promise<string>;
  askSecret(question: string): Promise<string>;
}

export class PromptCancelledError extends Error {
  constructor() {
    super('The pilot cancelled the prompt.');
  }
}
