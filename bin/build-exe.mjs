import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const OUTFILE = 'dist/flight-tracker-transponder.exe';

const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const token = process.env.ADSB_CLIENT_TOKEN ?? '';

if (token === '') {
  process.stdout.write('no ADSB_CLIENT_TOKEN given, baking an empty one\n');
}

const bun = process.platform === 'win32' ? 'bun.exe' : 'bun';

const result = spawnSync(
  bun,
  [
    'build',
    'src/main.ts',
    '--compile',
    '--target=bun-windows-x64',
    '--define',
    `process.env.ADSB_CLIENT_TOKEN=${JSON.stringify(token)}`,
    '--define',
    `process.env.APP_VERSION=${JSON.stringify(version)}`,
    '--outfile',
    OUTFILE,
  ],
  { stdio: 'inherit' },
);

if (result.error !== undefined) {
  process.stderr.write(`could not run ${bun}: ${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
