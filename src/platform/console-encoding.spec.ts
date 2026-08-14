import type { CommandRunner } from './command-runner';
import { useUtf8Console, UTF8_CODE_PAGE } from './console-encoding';

function recorder(status: 'ok' | 'failed' = 'ok'): {
  calls: [string, string[]][];
  run: CommandRunner;
} {
  const calls: [string, string[]][] = [];

  return {
    calls,
    run: (file, args) => {
      calls.push([file, args]);

      return Promise.resolve({ stdout: '', status });
    },
  };
}

describe('useUtf8Console', () => {
  it('asks Windows for the UTF-8 code page', async () => {
    const { calls, run } = recorder();

    await expect(useUtf8Console('win32', run)).resolves.toBe(true);
    expect(calls).toEqual([['chcp.com', [String(UTF8_CODE_PAGE)]]]);
  });

  it('leaves every other platform alone', async () => {
    const { calls, run } = recorder();

    await expect(useUtf8Console('darwin', run)).resolves.toBe(false);
    await expect(useUtf8Console('linux', run)).resolves.toBe(false);
    expect(calls).toEqual([]);
  });

  it('reports a console it could not reconfigure rather than throwing', async () => {
    const { run } = recorder('failed');

    await expect(useUtf8Console('win32', run)).resolves.toBe(false);
  });
});
