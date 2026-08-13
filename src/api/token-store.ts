import { promises as fs } from 'node:fs';
import type { SecretStore } from '../platform/secret-store';

export type StoredSession = {
  refreshToken: string;
};

export interface TokenStore {
  read(): Promise<StoredSession | null>;
  write(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export class FileTokenStore implements TokenStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<StoredSession | null> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(content);

      return isStoredSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async write(session: StoredSession): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(session), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true });
  }
}

export class SecretTokenStore implements TokenStore {
  private static readonly KEY = 'session';

  constructor(private readonly secrets: SecretStore) {}

  async read(): Promise<StoredSession | null> {
    const refreshToken = await this.secrets.read(SecretTokenStore.KEY);

    return refreshToken === null ? null : { refreshToken };
  }

  async write(session: StoredSession): Promise<void> {
    await this.secrets.write(SecretTokenStore.KEY, session.refreshToken);
  }

  async clear(): Promise<void> {
    await this.secrets.clear(SecretTokenStore.KEY);
  }
}

export class InMemoryTokenStore implements TokenStore {
  private session: StoredSession | null = null;

  read(): Promise<StoredSession | null> {
    return Promise.resolve(this.session);
  }

  write(session: StoredSession): Promise<void> {
    this.session = session;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.session = null;
    return Promise.resolve();
  }
}

function isStoredSession(value: unknown): value is StoredSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoredSession).refreshToken === 'string'
  );
}
