import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../client.ts';
import {
  backendAcceptSellerFulfillment,
  backendRejectSellerFulfillment,
  backendPackSellerFulfillment,
  backendCancelSellerFulfillment,
  backendDispatchSellerFulfillment,
  backendTrackSellerShipment,
  backendListSellerReturns,
} from './seller-fulfillment.ts';

describe('seller fulfillment client', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends the read version and reuses the caller idempotency key across retries', async () => {
    const fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const client = createApiClient({ baseUrl: 'https://example.test/api/v1' });
    await backendAcceptSellerFulfillment(client, 'fo', 7);
    expect(
      JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({ version: 7 });
    const input = { version: 7, reason: 'Unavailable' };
    await backendRejectSellerFulfillment(client, 'fo', input, 'same-key');
    await backendRejectSellerFulfillment(client, 'fo', input, 'same-key');
    for (const call of fetch.mock.calls.slice(1)) {
      expect(
        new Headers((call[1] as RequestInit).headers).get('idempotency-key'),
      ).toBe('same-key');
    }
  });
  it('uses seller-scoped routes for packing, cancellation, dispatch, tracking and returns', async () => {
    const fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const client = createApiClient({ baseUrl: 'https://example.test/api/v1' });
    const input = { lines: [{ fulfillmentLineId: 'line', quantity: 1 }] };
    await backendPackSellerFulfillment(client, 'fo', input, 'pack-key');
    await backendCancelSellerFulfillment(
      client,
      'fo',
      { ...input, reason: 'Unavailable' },
      'cancel-key',
    );
    await backendDispatchSellerFulfillment(
      client,
      'fo',
      { ...input, carrierCode: 'MANUAL' },
      'dispatch-key',
    );
    await backendTrackSellerShipment(
      client,
      'shipment',
      { normalizedStatus: 'DELIVERED', occurredAt: new Date().toISOString() },
      'tracking-key',
    );
    await backendListSellerReturns(client, { page: 2 });
    expect(
      fetch.mock.calls.map((call) => new URL(call[0] as string).pathname),
    ).toEqual([
      '/api/v1/sellers/me/fulfillments/fo/packs',
      '/api/v1/sellers/me/fulfillments/fo/cancellations',
      '/api/v1/sellers/me/fulfillments/fo/dispatches',
      '/api/v1/sellers/me/shipments/shipment/tracking-events',
      '/api/v1/sellers/me/returns',
    ]);
  });
});
