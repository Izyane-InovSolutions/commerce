import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshSession, resetRefreshStore } from './session-refresh';

function tokens(suffix: string) {
  return {
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    tokenType: 'Bearer',
    expiresIn: 900,
    user: { id: 'u', email: 'u@example.test', role: 'CUSTOMER' },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('refreshSession', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    resetRefreshStore();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges the refresh token for a new pair', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: tokens('2'), meta: { requestId: 'x' } }),
    );

    const outcome = await refreshSession('refresh-1');

    expect(outcome).toEqual({ status: 'renewed', tokens: tokens('2') });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/auth\/refresh$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      refreshToken: 'refresh-1',
    });
  });

  it('sends one request for concurrent refreshes of the same token', async () => {
    // A rotating token may only be spent once — a second use would make the
    // API revoke every session the account has.
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );

    const first = refreshSession('refresh-1');
    const second = refreshSession('refresh-1');
    resolve(jsonResponse(200, { data: tokens('2'), meta: { requestId: 'x' } }));

    expect(await first).toEqual(await second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('answers a late request for an already-spent token from memory', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: tokens('2'), meta: { requestId: 'x' } }),
    );

    await refreshSession('refresh-1');
    const late = await refreshSession('refresh-1');

    expect(late).toEqual({ status: 'renewed', tokens: tokens('2') });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forgets a remembered refresh once it is old', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { data: tokens('2'), meta: { requestId: 'x' } }),
      )
      .mockResolvedValueOnce(jsonResponse(401, { error: {} }));

    await refreshSession('refresh-1');
    const later = await refreshSession('refresh-1', Date.now() + 5 * 60_000);

    expect(later).toEqual({ status: 'rejected' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a refused token as rejected', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: {} }));

    expect(await refreshSession('spent')).toEqual({ status: 'rejected' });
  });

  it('reports an outage as unavailable, and tries again next time', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(
        jsonResponse(200, { data: tokens('2'), meta: { requestId: 'x' } }),
      );

    expect(await refreshSession('refresh-1')).toEqual({
      status: 'unavailable',
    });
    expect(await refreshSession('refresh-1')).toEqual({
      status: 'unavailable',
    });
    expect((await refreshSession('refresh-1')).status).toBe('renewed');
  });
});
