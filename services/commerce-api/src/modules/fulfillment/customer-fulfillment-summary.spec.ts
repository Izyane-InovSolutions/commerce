import { FulfillmentStatus } from '@prisma/client';

import { deriveCustomerFulfillmentSummary } from './customer-fulfillment-summary';

describe('deriveCustomerFulfillmentSummary', () => {
  it('is PREPARING when no fulfillment order exists yet', () => {
    expect(deriveCustomerFulfillmentSummary([])).toBe('PREPARING');
  });

  it('is PREPARING while every fulfillment order is still in progress', () => {
    expect(
      deriveCustomerFulfillmentSummary([
        FulfillmentStatus.READY_TO_PICK,
        FulfillmentStatus.PICKED,
      ]),
    ).toBe('PREPARING');
  });

  it('is PREPARING while on hold', () => {
    expect(deriveCustomerFulfillmentSummary([FulfillmentStatus.ON_HOLD])).toBe(
      'PREPARING',
    );
  });

  it('is PARTIALLY_DISPATCHED when some but not all fulfillment orders have shipped', () => {
    expect(
      deriveCustomerFulfillmentSummary([
        FulfillmentStatus.DISPATCHED,
        FulfillmentStatus.PACKED,
      ]),
    ).toBe('PARTIALLY_DISPATCHED');
  });

  it('is DISPATCHED once every fulfillment order has shipped or was cancelled', () => {
    expect(
      deriveCustomerFulfillmentSummary([
        FulfillmentStatus.DISPATCHED,
        FulfillmentStatus.CANCELLED,
      ]),
    ).toBe('DISPATCHED');
  });

  it('is CANCELLED only when every fulfillment order was cancelled', () => {
    expect(
      deriveCustomerFulfillmentSummary([
        FulfillmentStatus.CANCELLED,
        FulfillmentStatus.CANCELLED,
      ]),
    ).toBe('CANCELLED');
  });
});
