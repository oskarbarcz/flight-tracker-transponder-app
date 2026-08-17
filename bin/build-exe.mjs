import { readFileSync } from 'node:fs';

const OUTFILE = 'dist/mypreflight-transponder.exe';
const ICON = 'assets/icon.ico';

if (typeof Bun === 'undefined') {
  process.stderr.write('this needs the bun runtime: bun bin/build-exe.mjs\n');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync('package.json', 'utf-8'));
const token = process.env.ADSB_CLIENT_TOKEN ?? '';

if (token === '') {
  process.stdout.write('no ADSB_CLIENT_TOKEN given, baking an empty one\n');
}

const onWindows = process.platform === 'win32';

if (!onWindows) {
  process.stdout.write(`not on Windows, building without ${ICON}\n`);
}

const properties = {
  icon: ICON,
  title: 'MyPreflight transponder',
  publisher: manifest.author,
  version: manifest.version,
  description: manifest.description,
  copyright: `Public domain (${manifest.license})`,
};

let result;

try {
  result = await Bun.build({
    entrypoints: ['src/main.ts'],
    define: {
      'process.env.ADSB_CLIENT_TOKEN': JSON.stringify(token),
      'process.env.APP_VERSION': JSON.stringify(manifest.version),
    },
    compile: {
      target: 'bun-windows-x64',
      outfile: OUTFILE,
      ...(onWindows ? { windows: properties } : {}),
    },
  });
} catch (error) {
  process.stderr.write(`${error}\n`);
  process.exit(1);
}

if (!result.success) {
  for (const log of result.logs) {
    process.stderr.write(`${log}\n`);
  }

  process.exit(1);
}

process.stdout.write(
  `wrote ${OUTFILE}${onWindows ? ` with ${ICON} and file properties` : ''}\n`,
);
