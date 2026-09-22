import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiError, ApiUnreachableError } from './errors';

const BASE_URL = 'http://localhost:3000/api/v1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function lastRequest(fetchMock: ReturnType<typeof vi.fn>): {
  url: string;
  init: RequestInit;
} {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }

  return { url: call[0] as string, init: call[1] as RequestInit };
}

function lastHeaders(
  fetchMock: ReturnType<typeof vi.fn>,
): Record<string, string> {
  return lastRequest(fetchMock).init.headers as Record<string, string>;
}

describe('createApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves paths against the configured base url', async () => {
    const client = createApiClient({ baseUrl: BASE_URL });
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    await expect(client.get('/health')).resolves.toEqual({ status: 'ok' });
    expect(lastRequest(fetchMock).url).toBe(`${BASE_URL}/health`);
  });

  it('tolerates a trailing slash on the base url', async () => {
    const client = createApiClient({ baseUrl: `${BASE_URL}/` });
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    await client.get('health');
    expect(lastRequest(fetchMock).url).toBe(`${BASE_URL}/health`);
  });

  it('drops null and undefined query parameters', async () => {
    const client = createApiClient({ baseUrl: BASE_URL });
    fetchMock.mockResolvedValue(jsonResponse([]));

    await client.get('/products', {
      query: { q: 'desk', page: 2, category: null, brand: undefined },
    });

    const { searchParams } = new URL(lastRequest(fetchMock).url);
    expect(searchParams.get('q')).toBe('desk');
    expect(searchParams.get('page')).toBe('2');
    expect(searchParams.has('category')).toBe(false);
    expect(searchParams.has('brand')).toBe(false);
  });

  it('sends a correlation id and forwards an idempotency key', async () => {
    const client = createApiClient({ baseUrl: BASE_URL });
    fetchMock.mockResolvedValue(jsonResponse({ id: 'order-1' }, 201));

    await client.post('/orders', {
      body: { cartId: 'cart-1' },
      idempotencyKey: 'key-1',
    });

    const { init } = lastRequest(fetchMock);
    const headers = lastHeaders(fetchMock);

    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ cartId: 'cart-1' }));
    expect(headers['content-type']).toBe('application/json');
    expect(headers['idempotency-key']).toBe('key-1');
    expect(headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('gives each request its own correlation id', async () => {
    const client = createApiClient({ baseUrl: BASE_URL });
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ status: 'ok' })),
    );

    await client.get('/health');
    const first = lastHeaders(fetchMock)['x-request-id'];
    await client.get('/health');
    const second = lastHeaders(fetchMock)['x-request-id'];

    expect(first).not.toBe(second);
  });

  it('attaches auth headers resolved per request', async () => {
    let token = 'token-1';
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAuthHeaders: () => ({ authorization: `Bearer ${token}` }),
    });
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ status: 'ok' })),
    );

    await client.get('/health');
    expect(lastHeaders(fetchMock).authorization).toBe('Bearer token-1');

    token = 'token-2';
    await client.get('/health');
    expect(lastHeaders(fetchMock).authorization).toBe('Bearer token-2');
  });

  it('lets a per-call header override an auth header', async () => {
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAuthHeaders: () => ({ authorization: 'Bearer default' }),
    });
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    await client.get('/health', {
      headers: { authorization: 'Bearer override' },
    });

    expect(lastHeaders(fetchMock).authorization).toBe('Bearer override');
  });

  it('omits a content type when there is no body', async () => {
    const client = createApiClient({ baseUrl: BASE_URL });
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    await client.get('/health');
    expect(lastHeaders(fetchMock)['content-type']).toBeUndefined();
  });

  it('returns null for an empty 204 response', async () => {
    const client = createApiClient({ baseUrl: BASE_URL });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(client.delete('/cart/items/1')).resolves.toBe(null);
  });

  it('throws an ApiError carrying the status and validation messages', async () => {
    const client = createApiClient({ baseUrl: BASE_URL });
    fetchMock.mockResolvedValue(
      jsonResponse(
        { statusCode: 400, message: ['quantity must be positive'] },
        400,
      ),
    );

    const error = await client
      .post('/cart/items', { body: {} })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).message).toBe('quantity must be positive');
  });

  it('formats the Commerce API`s real nested error shape end to end', async () => {
    // Captured live from POST /auth/login with wrong credentials.
    const client = createApiClient({ baseUrl: BASE_URL, envelope: true });
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid email or password',
            details: [],
          },
          requestId: '88705416-5b9b-425a-88fa-fc61b5d351fd',
        },
        401,
      ),
    );

    const error = await client
      .post('/auth/login', { body: {} })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    // This is the exact failure that shipped: without unwrapping the nested
    // object, this message came out as the literal string "[object Object]".
    expect((error as ApiError).message).toBe('Invalid email or password');
  });

  it('throws an ApiUnreachableError when the request cannot be sent', async () => {
    const client = createApiClient({ baseUrl: BASE_URL });
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.get('/health')).rejects.toBeInstanceOf(
      ApiUnreachableError,
    );
  });
});
