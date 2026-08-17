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
