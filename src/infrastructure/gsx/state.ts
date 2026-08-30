export const DISCARDED_KEYS = [
  'handlerData',
  'commandIcons',
  'commandIconsSvg',
  'statusHtml',
];

export class GsxState {
  private held = new Map<string, unknown>();

  replaceAll(state: Record<string, unknown>): void {
    this.held = new Map();

    for (const [key, value] of Object.entries(state)) {
      this.put(key, value);
    }
  }

  replace(key: string, value: unknown): void {
    this.put(key, value);
  }

  get(key: string): unknown {
    return this.held.get(key);
  }

  keys(): string[] {
    return [...this.held.keys()];
  }

  clear(): void {
    this.held = new Map();
  }

  private put(key: string, value: unknown): void {
    if (DISCARDED_KEYS.includes(key)) {
      return;
    }

    if (value === null || value === undefined) {
      this.held.delete(key);

      return;
    }

    this.held.set(key, value);
  }
}
