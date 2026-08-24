import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'dotenv';

export type FileReader = (path: string) => string | null;

export function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

export function envFilePaths(
  cwd: string = process.cwd(),
  execPath: string = process.execPath,
): string[] {
  const beside = resolve(dirname(execPath), '.env');
  const local = resolve(cwd, '.env');

  return local === beside ? [local] : [local, beside];
}

export function loadEnvFiles(
  paths: string[],
  env: NodeJS.ProcessEnv = process.env,
  read: FileReader = readFileOrNull,
): void {
  for (const path of paths) {
    const content = read(path);

    if (content === null) {
      continue;
    }

    for (const [key, value] of Object.entries(parse(content))) {
      if (env[key] === undefined) {
        env[key] = value;
      }
    }
  }
}
