import { join } from 'node:path';
import type { CommandResult, CommandRunner } from './command-runner';
import { downloadsDirectory, uniquePath, versionedName } from './downloads';

function runner(...results: CommandResult[]): {
  run: CommandRunner;
  queries: string[];
} {
  const queries: string[] = [];
  const queue = [...results];

  return {
    queries,
    run: (file, args) => {
      queries.push(`${file} ${args.join(' ')}`);

      return Promise.resolve(
        queue.shift() ?? { stdout: '', status: 'failed' as const },
      );
    },
  };
}

function registryAnswer(path: string): CommandResult {
  return {
    status: 'ok',
    stdout: [
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders',
      `    {374DE290-123F-4565-9164-39C4925E467B}    REG_SZ    ${path}`,
    ].join('\n'),
  };
}

describe('downloadsDirectory', () => {
  it('takes the folder Windows itself reports, so a moved Downloads is honoured', async () => {
    const { run } = runner(registryAnswer('D:\\Downloads'));

    await expect(
      downloadsDirectory('win32', { USERPROFILE: 'C:\\Users\\pilot' }, run),
    ).resolves.toBe('D:\\Downloads');
  });

  it('expands the variables Windows leaves in the registry', async () => {
    const { run } = runner({
      status: 'ok',
      stdout:
        '    {374DE290-123F-4565-9164-39C4925E467B}    REG_EXPAND_SZ    %USERPROFILE%\\Downloads',
    });

    await expect(
      downloadsDirectory('win32', { USERPROFILE: 'C:\\Users\\pilot' }, run),
    ).resolves.toBe('C:\\Users\\pilot\\Downloads');
  });

  it('falls back to the profile when the registry says nothing', async () => {
    const { run, queries } = runner();

    await expect(
      downloadsDirectory('win32', { USERPROFILE: 'C:\\Users\\pilot' }, run),
    ).resolves.toBe(join('C:\\Users\\pilot', 'Downloads'));
    expect(queries).toHaveLength(2);
  });

  it('never shells out to the registry off Windows', async () => {
    const { run, queries } = runner();

    await expect(
      downloadsDirectory('darwin', {}, run, () => '/Users/pilot'),
    ).resolves.toBe(join('/Users/pilot', 'Downloads'));
    expect(queries).toEqual([]);
  });
});

describe('versionedName', () => {
  it('stamps the version into the file name', () => {
    expect(versionedName('mypreflight-transponder.exe', '0.12.0')).toBe(
      'mypreflight-transponder-0.12.0.exe',
    );
  });

  it('copes with a name that has no extension', () => {
    expect(versionedName('transponder', '1.0.0')).toBe('transponder-1.0.0');
  });
});

describe('uniquePath', () => {
  it('uses the plain name when nothing is in the way', () => {
    expect(uniquePath('/downloads', 'app-1.0.0.exe', () => false)).toBe(
      join('/downloads', 'app-1.0.0.exe'),
    );
  });

  it('never overwrites a file the pilot already downloaded', () => {
    const existing = [
      join('/downloads', 'app-1.0.0.exe'),
      join('/downloads', 'app-1.0.0 (1).exe'),
    ];

    expect(
      uniquePath('/downloads', 'app-1.0.0.exe', (path) =>
        existing.includes(path),
      ),
    ).toBe(join('/downloads', 'app-1.0.0 (2).exe'));
  });

  it('gives up rather than looping forever', () => {
    expect(() => uniquePath('/downloads', 'app.exe', () => true)).toThrow(
      'already 100 copies',
    );
  });
});
