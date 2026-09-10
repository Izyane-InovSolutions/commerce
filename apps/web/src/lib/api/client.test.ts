import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from './client';
import { ApiError, ApiUnreachableError } from './errors';
import { env } from '@/lib/env';

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

describe('apiFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves the path against the configured API base url', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    await expect(apiFetch('/health')).resolves.toEqual({ status: 'ok' });
    expect(lastRequest(fetchMock).url).toBe(`${env.apiBaseUrl}/health`);
  });

  it('drops null and undefined query parameters', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    await apiFetch('/products', {
      query: { q: 'desk', page: 2, category: null, brand: undefined },
    });

    const { searchParams } = new URL(lastRequest(fetchMock).url);
    expect(searchParams.get('q')).toBe('desk');
    expect(searchParams.get('page')).toBe('2');
    expect(searchParams.has('category')).toBe(false);
    expect(searchParams.has('brand')).toBe(false);
  });

  it('sends a correlation id and forwards an idempotency key', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'order-1' }, 201));

    await apiFetch('/orders', {
      method: 'POST',
      body: { cartId: 'cart-1' },
      idempotencyKey: 'key-1',
    });

    const { init } = lastRequest(fetchMock);
    const headers = init.headers as Record<string, string>;

    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ cartId: 'cart-1' }));
    expect(headers['content-type']).toBe('application/json');
    expect(headers['idempotency-key']).toBe('key-1');
    expect(headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('omits a content type when there is no body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    await apiFetch('/health');

    const headers = lastRequest(fetchMock).init.headers as Record<
      string,
      string
    >;
    expect(headers['content-type']).toBeUndefined();
  });

  it('returns null for an empty 204 response', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiFetch('/cart/items/1', { method: 'DELETE' })).resolves.toBe(
      null,
    );
  });

  it('throws an ApiError carrying the status and validation messages', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { statusCode: 400, message: ['quantity must be positive'] },
        400,
      ),
    );

    const error = await apiFetch('/cart/items', {
      method: 'POST',
      body: {},
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).message).toBe('quantity must be positive');
  });

  it('throws an ApiUnreachableError when the request cannot be sent', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(apiFetch('/health')).rejects.toBeInstanceOf(
      ApiUnreachableError,
    );
  });
});
