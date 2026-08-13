import type { CommandResult, CommandRunner } from './command-runner';
import {
  DpapiSecretStore,
  KeychainSecretStore,
  secretStoreFor,
} from './secret-store';

type Recorded = { file: string; args: string[] };

function recorder(result: CommandResult): {
  run: CommandRunner;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];

  return {
    calls,
    run: (file, args) => {
      calls.push({ file, args });
      return Promise.resolve(result);
    },
  };
}

describe('KeychainSecretStore', () => {
  it('reads a secret out of the login keychain', async () => {
    const { run, calls } = recorder({ stdout: 'refresh-1', status: 'ok' });

    const value = await new KeychainSecretStore(run).read('session');

    expect(value).toBe('refresh-1');
    expect(calls[0]?.file).toBe('security');
    expect(calls[0]?.args).toContain('find-generic-password');
    expect(calls[0]?.args).toContain('flight-tracker-transponder:session');
  });

  it('reports nothing when the item is absent', async () => {
    const { run } = recorder({ stdout: '', status: 'failed' });

    expect(await new KeychainSecretStore(run).read('session')).toBeNull();
  });

  it('overwrites an existing item rather than duplicating it', async () => {
    const { run, calls } = recorder({ stdout: '', status: 'ok' });

    await new KeychainSecretStore(run).write('session', 'refresh-2');

    expect(calls[0]?.args).toContain('-U');
    expect(calls[0]?.args).toContain('refresh-2');
  });
});

describe('DpapiSecretStore', () => {
  it('encrypts through PowerShell rather than a native binding', async () => {
    const { run, calls } = recorder({ stdout: '', status: 'ok' });

    await new DpapiSecretStore('C:\\data', run).write('session', 'refresh-1');

    expect(calls[0]?.file).toBe('powershell.exe');
    expect(calls[0]?.args.join(' ')).toContain('ConvertFrom-SecureString');
    expect(calls[0]?.args.join(' ')).toContain('C:\\data\\session.secret');
  });

  it('reads the encrypted blob back', async () => {
    const { run } = recorder({ stdout: 'refresh-1', status: 'ok' });

    expect(await new DpapiSecretStore('C:\\data', run).read('session')).toBe(
      'refresh-1',
    );
  });

  it('reports nothing when the blob is missing', async () => {
    const { run } = recorder({ stdout: '', status: 'ok' });

    expect(
      await new DpapiSecretStore('C:\\data', run).read('session'),
    ).toBeNull();
  });
});

describe('secretStoreFor', () => {
  const { run } = recorder({ stdout: '', status: 'ok' });

  it('uses DPAPI on Windows', () => {
    expect(secretStoreFor('win32', 'C:\\data', run)).toBeInstanceOf(
      DpapiSecretStore,
    );
  });

  it('uses the keychain on macOS', () => {
    expect(secretStoreFor('darwin', '/tmp', run)).toBeInstanceOf(
      KeychainSecretStore,
    );
  });

  it('has nothing to offer elsewhere', () => {
    expect(secretStoreFor('linux', '/tmp', run)).toBeNull();
  });
});
