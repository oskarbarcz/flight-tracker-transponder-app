import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

export type RecordedRequest = {
  method: string;
  path: string;
  authorization: string | undefined;
  body: string;
};

export type StubRoute = (request: RecordedRequest) =>
  | { status: number; body?: unknown }
  | Promise<{
      status: number;
      body?: unknown;
    }>;

export class StubService {
  private server: Server | null = null;
  private port = 0;

  readonly requests: RecordedRequest[] = [];

  constructor(private readonly routes: Record<string, StubRoute>) {}

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(0, '127.0.0.1', resolve);
    });

    const address = this.server?.address();

    if (
      address === null ||
      address === undefined ||
      typeof address === 'string'
    ) {
      throw new Error('the stub service did not bind to a port');
    }

    this.port = address.port;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;

    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
    });
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  requestsTo(path: string): RecordedRequest[] {
    return this.requests.filter((request) => request.path === path);
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const body = await readBody(request);
    const path = request.url ?? '';
    const recorded: RecordedRequest = {
      method: request.method ?? 'GET',
      path,
      authorization: request.headers.authorization,
      body,
    };

    this.requests.push(recorded);

    const route = this.routes[`${recorded.method} ${path}`];

    if (route === undefined) {
      response.writeHead(404).end();
      return;
    }

    const result = await route(recorded);

    if (result.body === undefined) {
      response.writeHead(result.status).end();
      return;
    }

    response
      .writeHead(result.status, { 'Content-Type': 'application/json' })
      .end(JSON.stringify(result.body));
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}
