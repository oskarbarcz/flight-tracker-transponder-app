import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appDirectory,
  ensureWritable,
  expandVariables,
  resolveStorage,
} from './paths';

describe('appDirectory', () => {
  it('keeps the state beside the executable, wherever it was started from', () => {
    const folder = join('D:', 'portable');

    expect(
      appDirectory(
        join(folder, 'mypreflight-transponder.exe'),
        join('C:', 'Windows'),
      ),
    ).toBe(folder);
  });

  it('falls back to the working directory when a runtime is in charge', () => {
    expect(appDirectory('/usr/local/bin/node', '/home/pilot/app')).toBe(
      '/home/pilot/app',
    );
    expect(
      appDirectory(join('C:', 'nodejs', 'node.exe'), join('C:', 'repo')),
    ).toBe(join('C:', 'repo'));
  });
});

describe('expandVariables', () => {
  it('fills in Windows style variables', () => {
    expect(
      expandVariables('%LOCALAPPDATA%\\MyPreflight', {
        LOCALAPPDATA: 'C:\\Users\\pilot\\AppData\\Local',
      }),
    ).toBe('C:\\Users\\pilot\\AppData\\Local\\MyPreflight');
  });

  it('leaves an unknown variable alone rather than emptying the path', () => {
    expect(expandVariables('%NOPE%\\data', {})).toBe('%NOPE%\\data');
  });
});

describe('resolveStorage', () => {
  it('stores everything beside the executable by default', () => {
    expect(resolveStorage('/opt/app', undefined, () => true)).toEqual({
      directory: '/opt/app',
      writable: true,
    });
  });

  it('reports a folder it cannot write to', () => {
    expect(resolveStorage('/read-only', undefined, () => false)).toEqual({
      directory: '/read-only',
      writable: false,
    });
  });

  it('honours an explicit data directory', () => {
    const storage = resolveStorage(
      '/opt/app',
      '%LOCALAPPDATA%/MyPreflight',
      () => true,
      { LOCALAPPDATA: '/home/pilot/.local' },
    );

    expect(storage.directory).toBe('/home/pilot/.local/MyPreflight');
  });

  it('reads a relative data directory against the app folder', () => {
    expect(resolveStorage('/opt/app', 'data', () => true, {}).directory).toBe(
      '/opt/app/data',
    );
  });

  it('ignores a blank data directory', () => {
    expect(resolveStorage('/opt/app', '   ', () => true, {}).directory).toBe(
      '/opt/app',
    );
  });
});

describe('ensureWritable', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'ft-paths-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('says yes for a folder it can write to, and leaves no probe behind', () => {
    expect(ensureWritable(directory)).toBe(true);
    expect(readdirSync(directory)).toEqual([]);
  });

  it('creates the folder when it is missing', () => {
    expect(ensureWritable(join(directory, 'nested', 'deeper'))).toBe(true);
  });

  it('says no when the path is not a folder at all', () => {
    expect(ensureWritable('\u0000')).toBe(false);
  });
});
