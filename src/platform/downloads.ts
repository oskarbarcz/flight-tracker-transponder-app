import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import { type CommandRunner, runCommand } from './command-runner';
import { expandVariables } from './paths';

const DOWNLOADS_GUID = '{374DE290-123F-4565-9164-39C4925E467B}';

const SHELL_FOLDER_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders',
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
];

const REGISTRY_VALUE = /REG_(?:EXPAND_)?SZ\s+(.+)$/m;

const MAX_SUFFIX = 100;

export async function downloadsDirectory(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  run: CommandRunner = runCommand,
  home: () => string = homedir,
): Promise<string> {
  if (platform === 'win32') {
    const registered = await registeredDownloads(run, env);

    if (registered !== null) {
      return registered;
    }
  }

  const profile = env.USERPROFILE?.trim() ?? '';

  return join(profile === '' ? home() : profile, 'Downloads');
}

async function registeredDownloads(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  for (const key of SHELL_FOLDER_KEYS) {
    const result = await run('reg.exe', ['query', key, '/v', DOWNLOADS_GUID]);

    if (result.status !== 'ok') {
      continue;
    }

    const found = REGISTRY_VALUE.exec(result.stdout);
    const path = expandVariables(found?.[1]?.trim() ?? '', env);

    if (path !== '' && !path.includes('%')) {
      return path;
    }
  }

  return null;
}

export function versionedName(assetName: string, version: string): string {
  const extension = extname(assetName);
  const stem = assetName.slice(0, assetName.length - extension.length);

  return `${stem}-${version}${extension}`;
}

export function uniquePath(
  directory: string,
  fileName: string,
  taken: (path: string) => boolean = existsSync,
): string {
  const extension = extname(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length);

  for (let suffix = 0; suffix < MAX_SUFFIX; suffix += 1) {
    const candidate = join(
      directory,
      suffix === 0 ? fileName : `${stem} (${suffix})${extension}`,
    );

    if (!taken(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `there are already ${MAX_SUFFIX} copies of ${fileName} in ${directory}`,
  );
}
