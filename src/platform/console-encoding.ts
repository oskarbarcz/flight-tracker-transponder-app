import { type CommandRunner, runCommand } from './command-runner';

export const UTF8_CODE_PAGE = 65001;

// conhost still opens on an OEM code page — 437 in the US, 852 in Poland —
// and the dashboard is drawn almost entirely out of box-drawing characters.
// Windows Terminal and every non-Windows terminal are already UTF-8, so this
// is a no-op there.
//
// Whether it is needed at all depends on how the runtime reaches the console:
// one that calls WriteConsoleW converts from UTF-8 itself and never consults
// the code page. Asking costs one short-lived process and is never fatal, so
// it is worth doing rather than reasoning about which runtime we are under.
export async function useUtf8Console(
  platform: NodeJS.Platform,
  run: CommandRunner = runCommand,
): Promise<boolean> {
  if (platform !== 'win32') {
    return false;
  }

  const result = await run('chcp.com', [String(UTF8_CODE_PAGE)]);

  return result.status === 'ok';
}
