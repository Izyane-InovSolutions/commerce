import { describe, expect, it } from 'vitest';
import {
  backendSellerFulfillmentDetailSchema,
  backendSellerDestinationSchema,
  backendSellerTrackingInputSchema,
} from './seller-operations.ts';

describe('seller operations contracts', () => {
  const fulfillment = {
    id: null,
    version: 4,
    fulfillmentNumber: 'FO-1',
    status: 'AWAITING_ACCEPTANCE',
    awaitingAcceptance: true,
    acceptedAt: null,
    heldReason: null,
    lines: [],
    events: [],
  };
  it('requires the concurrency version in the seller projection', () => {
    expect(
      backendSellerFulfillmentDetailSchema.parse(fulfillment).version,
    ).toBe(4);
    expect(
      backendSellerFulfillmentDetailSchema.safeParse({
        ...fulfillment,
        version: undefined,
      }).success,
    ).toBe(false);
  });
  it('accepts redacted destinations but rejects partially disclosed addresses', () => {
    const coarse = { city: 'Lusaka', region: null, country: 'ZM' };
    expect(backendSellerDestinationSchema.safeParse(coarse).success).toBe(true);
    expect(
      backendSellerDestinationSchema.safeParse({ ...coarse, line1: 'Private' })
        .success,
    ).toBe(false);
  });
  it('does not allow a seller to submit arbitrary tracking states', () => {
    expect(
      backendSellerTrackingInputSchema.safeParse({
        normalizedStatus: 'CREATED',
        occurredAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});
