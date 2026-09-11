import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import { handleMockRequest } from './router.ts';
import { resetDb } from './store.ts';

const PORT = Number(process.env.PORT ?? 3000);
const BASE_PATH = process.env.MOCK_BASE_PATH ?? '/api/v1';

/** Collects a Node request body into the byte array `Request` expects. */
async function readBody(
  request: IncomingMessage,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }

  // Copied into a plain ArrayBuffer so the value satisfies `BodyInit`.
  return chunks.length === 0
    ? undefined
    : Uint8Array.from(Buffer.concat(chunks));
}

function toRequest(
  incoming: IncomingMessage,
  body: Uint8Array<ArrayBuffer> | undefined,
): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    }
  }

  return new Request(`http://localhost:${PORT}${incoming.url ?? '/'}`, {
    method: incoming.method ?? 'GET',
    headers,
    body,
  });
}

async function send(
  response: Response,
  outgoing: ServerResponse,
): Promise<void> {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, key) => outgoing.setHeader(key, value));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer((incoming, outgoing) => {
  void (async () => {
    const url = new URL(incoming.url ?? '/', `http://localhost:${PORT}`);

    // Browsers preflight cross-origin writes from the portals.
    if (incoming.method === 'OPTIONS') {
      outgoing.writeHead(204, corsHeaders()).end();
      return;
    }

    // A convenience for development: put the fixtures back to their seed state.
    if (incoming.method === 'POST' && url.pathname === '/__reset') {
      resetDb();
      outgoing.writeHead(200, {
        'content-type': 'application/json',
        ...corsHeaders(),
      });
      outgoing.end(JSON.stringify({ status: 'reset' }));
      return;
    }

    if (!url.pathname.startsWith(BASE_PATH)) {
      outgoing.writeHead(404, {
        'content-type': 'application/json',
        ...corsHeaders(),
      });
      outgoing.end(
        JSON.stringify({
          statusCode: 404,
          message: `The mock API is served under ${BASE_PATH}.`,
          error: 'Not Found',
        }),
      );
      return;
    }

    try {
      const body = await readBody(incoming);
      const response = await handleMockRequest(
        toRequest(incoming, body),
        url.pathname.slice(BASE_PATH.length),
      );

      for (const [key, value] of Object.entries(corsHeaders())) {
        response.headers.set(key, value);
      }
      await send(response, outgoing);
    } catch (error) {
      console.error('[mock-api] request failed', error);
      outgoing.writeHead(500, { 'content-type': 'application/json' });
      outgoing.end(
        JSON.stringify({
          statusCode: 500,
          message: 'The mock API threw an unexpected error.',
          error: 'Internal Server Error',
        }),
      );
    }
  })();
});

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,idempotency-key,x-request-id',
  };
}

server.listen(PORT, () => {
  console.log(
    [
      '',
      '  Commerce mock API',
      `  http://localhost:${PORT}${BASE_PATH}`,
      '',
      '  Serving @commerce/contracts from in-memory fixtures.',
      '  This is NOT the real API. Stop it and start the NestJS API to',
      '  integrate — the clients need no configuration change.',
      '',
      '  POST /__reset returns the fixtures to their seed state.',
      '',
    ].join('\n'),
  );
});
