import { ManualCarrierProvider } from './manual-carrier.provider';

describe('ManualCarrierProvider', () => {
  const provider = new ManualCarrierProvider();

  it('identifies itself as the ZONE provider', () => {
    expect(provider.providerCode).toBe('ZONE');
  });

  it('books a shipment with a generated tracking reference and no webhook support', () => {
    expect((provider as { parseWebhook?: unknown }).parseWebhook).toBeUndefined();

    return provider
      .book({
        shipmentId: 'ship-1',
        shipmentNumber: 'SH-2026-000001',
        carrierCode: 'MANUAL',
        methodCode: 'DOMESTIC_STANDARD_V1',
        destinationCountry: 'ZM',
      })
      .then((result) => {
        expect(result.trackingReference).toContain('SH-2026-000001');
      });
  });

  it('cancels and polls as no-ops', async () => {
    await expect(provider.cancel()).resolves.toBeUndefined();
    await expect(provider.poll()).resolves.toEqual([]);
  });
});
