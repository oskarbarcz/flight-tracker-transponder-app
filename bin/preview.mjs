// Serves index.html and forwards its API calls to the ADS-B service, so the
// track preview can be looked at on a development machine.
//
//   ADSB_CLIENT_TOKEN=… npm run preview     (or put it in .env)
//
// This is not a way around CORS so much as a way of not needing one. The
// service answers `access-control-allow-origin: https://flights.barcz.me` and
// nothing else, so a page opened from the filesystem or from any localhost port
// makes a cross-origin request that the browser refuses to hand back — note
// that the *service* replies 200, it is the browser that withholds the body.
// Served from here the page and the data share an origin, so the same-origin
// policy never comes into it and there is nothing to disable.
//
// The other reason it is a proxy: the token stays in this process. It has no
// business being in a page that lives in a public repository, which is where it
// was.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const PAGE = 'index.html';
const PORT = Number(process.env.PREVIEW_PORT ?? 4170);
const BASE_URL = (
  process.env.ADSB_BASE_URL ?? 'https://adsb.barcz.me'
).replace(/\/+$/, '');

const token = process.env.ADSB_CLIENT_TOKEN ?? (await tokenFromEnvFile());

if (token === '') {
  process.stdout.write(
    'no ADSB_CLIENT_TOKEN in the environment or .env: the service will answer 401\n',
  );
}

const server = createServer((request, response) => {
  void handle(request, response).catch((error) => {
    process.stderr.write(`preview failed: ${error}\n`);
    response.writeHead(502, { 'Content-Type': 'text/plain' }).end(String(error));
  });
});

// Loopback only, and deliberately: every request this forwards carries the
// ADS-B client token, so it must not be something the rest of the network can
// borrow.
server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(
    `preview on http://127.0.0.1:${PORT} — /api proxied to ${BASE_URL}\n`,
  );
});

async function handle(request, response) {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    await proxy(url, response);

    return;
  }

  if (url.pathname === '/' || url.pathname === `/${PAGE}`) {
    response
      .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      .end(await readFile(PAGE));

    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
}

async function proxy(url, response) {
  const target = `${BASE_URL}${url.pathname}${url.search}`;
  const upstream = await fetch(target, {
    headers: token === '' ? {} : { Authorization: `Bearer ${token}` },
  });
  const body = Buffer.from(await upstream.arrayBuffer());

  process.stdout.write(
    `${upstream.status} ${url.pathname}${url.search} (${body.length} bytes)\n`,
  );

  response
    .writeHead(upstream.status, {
      'Content-Type':
        upstream.headers.get('content-type') ?? 'application/json',
    })
    .end(body);
}

// The same file the app itself reads, parsed only as far as this needs it: one
// key, optionally quoted.
async function tokenFromEnvFile() {
  try {
    const text = await readFile('.env', 'utf-8');

    for (const line of text.split('\n')) {
      const found = /^\s*ADSB_CLIENT_TOKEN\s*=\s*(.*?)\s*$/.exec(line);

      if (found !== null) {
        return found[1].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    return '';
  }

  return '';
}
