import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const RUNTIMES = [
  'node',
  'node.exe',
  'bun',
  'bun.exe',
  'bunx',
  'bunx.exe',
  'ts-node',
  'ts-node.exe',
  'ts-node-dev',
  'ts-node-dev.exe',
];

export type WriteProbe = (directory: string) => boolean;

export type Storage = {
  directory: string;
  writable: boolean;
};

export function appDirectory(
  execPath: string = process.execPath,
  cwd: string = process.cwd(),
): string {
  return RUNTIMES.includes(basename(execPath).toLowerCase())
    ? cwd
    : dirname(execPath);
}

export function expandVariables(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => {
    const replacement = env[name];

    return replacement === undefined || replacement === ''
      ? whole
      : replacement;
  });
}

export function ensureWritable(directory: string): boolean {
  const probe = join(directory, `.write-probe-${process.pid}`);

  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(probe, '');
    rmSync(probe, { force: true });

    return true;
  } catch {
    return false;
  }
}

export function resolveStorage(
  appDir: string,
  override: string | undefined = undefined,
  probe: WriteProbe = ensureWritable,
  env: NodeJS.ProcessEnv = process.env,
): Storage {
  const wanted = override?.trim() ?? '';
  const directory =
    wanted === '' ? appDir : resolve(appDir, expandVariables(wanted, env));

  return { directory, writable: probe(directory) };
}
