import {
  computeItemDeliveryCoverage,
  computeSellerOrderCoverage,
  type DeliveredQuantityChunk,
} from './review-eligibility';

const DAY_MS = 24 * 60 * 60 * 1000;
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

describe('computeItemDeliveryCoverage', () => {
  it('is eligible once delivered quantity fully covers the non-cancelled quantity', () => {
    const chunks: DeliveredQuantityChunk[] = [
      { quantity: 2, deliveredAt: daysAgo(1) },
    ];
    const result = computeItemDeliveryCoverage(2, 0, chunks);
    expect(result.eligible).toBe(true);
    expect(result.requiredQuantity).toBe(2);
    expect(result.deliveredQuantity).toBe(2);
  });

  it('is ineligible when delivered quantity only partially covers the item', () => {
    const chunks: DeliveredQuantityChunk[] = [
      { quantity: 1, deliveredAt: daysAgo(1) },
    ];
    const result = computeItemDeliveryCoverage(3, 0, chunks);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/not been fully delivered/);
  });

  it('sums quantity across split deliveries', () => {
    const chunks: DeliveredQuantityChunk[] = [
      { quantity: 1, deliveredAt: daysAgo(5) },
      { quantity: 2, deliveredAt: daysAgo(1) },
    ];
    const result = computeItemDeliveryCoverage(3, 0, chunks);
    expect(result.eligible).toBe(true);
    expect(result.deliveredQuantity).toBe(3);
  });

  it('picks the latest deliveredAt across split deliveries', () => {
    const latest = daysAgo(1);
    const chunks: DeliveredQuantityChunk[] = [
      { quantity: 1, deliveredAt: daysAgo(5) },
      { quantity: 2, deliveredAt: latest },
    ];
    const result = computeItemDeliveryCoverage(3, 0, chunks);
    expect(result.lastDeliveredAt).toEqual(latest);
  });

  it('subtracts cancelled quantity from the required quantity', () => {
    const chunks: DeliveredQuantityChunk[] = [
      { quantity: 2, deliveredAt: daysAgo(1) },
    ];
    // 5 ordered, 3 cancelled, 2 delivered -> exactly covers the remaining 2
    const result = computeItemDeliveryCoverage(5, 3, chunks);
    expect(result.eligible).toBe(true);
  });

  it('is never eligible when fully cancelled before delivery, even with zero required and zero delivered', () => {
    const result = computeItemDeliveryCoverage(2, 2, []);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/cancelled before delivery/);
    expect(result.requiredQuantity).toBe(0);
    expect(result.deliveredQuantity).toBe(0);
  });

  it('is ineligible when nothing has been delivered', () => {
    const result = computeItemDeliveryCoverage(2, 0, []);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/not been fully delivered/);
  });
});

describe('computeSellerOrderCoverage', () => {
  it('is eligible only when every item individually clears coverage', () => {
    const eligible = computeItemDeliveryCoverage(1, 0, [
      { quantity: 1, deliveredAt: daysAgo(2) },
    ]);
    const ineligible = computeItemDeliveryCoverage(1, 0, []);
    expect(computeSellerOrderCoverage([eligible]).eligible).toBe(true);
    expect(computeSellerOrderCoverage([eligible, ineligible]).eligible).toBe(
      false,
    );
  });

  it('is ineligible for a seller order with no items', () => {
    const result = computeSellerOrderCoverage([]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/no items/);
  });

  it('reports the latest deliveredAt across all covered items', () => {
    const latest = daysAgo(1);
    const a = computeItemDeliveryCoverage(1, 0, [
      { quantity: 1, deliveredAt: daysAgo(5) },
    ]);
    const b = computeItemDeliveryCoverage(1, 0, [
      { quantity: 1, deliveredAt: latest },
    ]);
    expect(computeSellerOrderCoverage([a, b]).lastDeliveredAt).toEqual(latest);
  });
});
