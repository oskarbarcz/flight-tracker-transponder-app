import { type CommandRunner, runCommand } from './command-runner';

export const UTF8_CODE_PAGE = 65001;

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
