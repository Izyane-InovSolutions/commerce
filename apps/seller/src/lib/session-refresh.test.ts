import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshSession, resetRefreshStore } from './session-refresh';

const pair = { accessToken: 'a2', refreshToken: 'r2', expiresIn: 900 };

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
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

  it('returns the new pair from the envelope', async () => {
    fetchMock.mockResolvedValue(respond(200, { data: pair }));
    await expect(refreshSession('r1')).resolves.toEqual({
      status: 'renewed',
      tokens: pair,
    });
  });

  it('spends a refresh token once when requests race', async () => {
    fetchMock.mockResolvedValue(respond(200, { data: pair }));
    const results = await Promise.all([
      refreshSession('r1'),
      refreshSession('r1'),
      refreshSession('r1'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  it('answers a late request for a spent token from memory', async () => {
    fetchMock.mockResolvedValue(respond(200, { data: pair }));
    await refreshSession('r1', 0);
    await refreshSession('r1', 30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forgets a result once it is stale', async () => {
    fetchMock.mockImplementation(async () => respond(200, { data: pair }));
    await refreshSession('r1', Date.now());
    await refreshSession('r1', Date.now() + 61_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([401, 400])('treats %i as a rejected token', async (status) => {
    fetchMock.mockResolvedValue(respond(status, { error: 'nope' }));
    await expect(refreshSession('r1')).resolves.toEqual({
      status: 'rejected',
    });
  });

  it('retries after the API was unavailable', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(respond(503))
      .mockResolvedValueOnce(respond(200, { data: pair }));
    await expect(refreshSession('r1')).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(refreshSession('r1')).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(refreshSession('r1')).resolves.toMatchObject({
      status: 'renewed',
    });
  });

  it('does not trust a malformed success body', async () => {
    fetchMock.mockResolvedValue(respond(200, { data: { accessToken: 'a2' } }));
    await expect(refreshSession('r1')).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
