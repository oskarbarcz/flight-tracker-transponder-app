// Compiles the Windows executable. This runs under bun rather than node,
// because the icon and the file properties Windows shows in a file's
// Details tab are only reachable through the JavaScript build API — there
// are no CLI flags for publisher, description or copyright.
//
//   bun bin/build-exe.mjs

import { readFileSync } from 'node:fs';

const OUTFILE = 'dist/flight-tracker-transponder.exe';
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

// Stamping the icon and the properties into the PE goes through Windows
// APIs, so bun cannot do either when cross-compiling. It does not say so: the
// build reports success and the executable keeps bun's own steamed-bun logo
// and bun's own version block. Release builds run on a Windows runner and get
// ours; a build from a developer's Mac is otherwise identical, but it is
// bun-branded rather than merely anonymous, which is worth knowing before
// wondering why a locally built exe looks wrong.
const onWindows = process.platform === 'win32';

if (!onWindows) {
  process.stdout.write(`not on Windows, building without ${ICON}\n`);
}

const properties = {
  icon: ICON,
  title: 'Flight Tracker transponder',
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
  // Bun throws an AggregateError on a failed build and reports the reason
  // through its own logs, so print whatever shape actually turns up.
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
