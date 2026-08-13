import { type CommandRunner, runCommand } from './command-runner';

const SERVICE_NAME = 'flight-tracker-transponder';

export interface SecretStore {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  clear(key: string): Promise<void>;
}

export class KeychainSecretStore implements SecretStore {
  constructor(private readonly run: CommandRunner = runCommand) {}

  async read(key: string): Promise<string | null> {
    const result = await this.run('security', [
      'find-generic-password',
      '-s',
      `${SERVICE_NAME}:${key}`,
      '-w',
    ]);

    return result.status === 'ok' && result.stdout !== ''
      ? result.stdout
      : null;
  }

  async write(key: string, value: string): Promise<void> {
    await this.run('security', [
      'add-generic-password',
      '-U',
      '-s',
      `${SERVICE_NAME}:${key}`,
      '-a',
      SERVICE_NAME,
      '-w',
      value,
    ]);
  }

  async clear(key: string): Promise<void> {
    await this.run('security', [
      'delete-generic-password',
      '-s',
      `${SERVICE_NAME}:${key}`,
    ]);
  }
}

export class DpapiSecretStore implements SecretStore {
  constructor(
    private readonly directory: string,
    private readonly run: CommandRunner = runCommand,
  ) {}

  async read(key: string): Promise<string | null> {
    const result = await this.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `if (Test-Path '${this.pathFor(key)}') { $secure = Get-Content '${this.pathFor(key)}' | ConvertTo-SecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)) }`,
    ]);

    return result.status === 'ok' && result.stdout !== ''
      ? result.stdout
      : null;
  }

  async write(key: string, value: string): Promise<void> {
    await this.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `ConvertTo-SecureString '${value}' -AsPlainText -Force | ConvertFrom-SecureString | Set-Content '${this.pathFor(key)}'`,
    ]);
  }

  async clear(key: string): Promise<void> {
    await this.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Remove-Item '${this.pathFor(key)}' -ErrorAction SilentlyContinue`,
    ]);
  }

  private pathFor(key: string): string {
    return `${this.directory}\\${key}.secret`;
  }
}

export function secretStoreFor(
  platform: NodeJS.Platform,
  directory: string,
  run: CommandRunner = runCommand,
): SecretStore | null {
  if (platform === 'win32') {
    return new DpapiSecretStore(directory, run);
  }

  if (platform === 'darwin') {
    return new KeychainSecretStore(run);
  }

  return null;
}
