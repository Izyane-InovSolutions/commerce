// Pure, DB-free eligibility math so it can be unit-tested directly (see
// review-eligibility.spec.ts) — mirrors return-eligibility.ts's convention.
// ReviewEligibilityService is the only caller.

export type DeliveredQuantityChunk = {
  quantity: number;
  deliveredAt: Date;
};

export type ItemCoverage = {
  eligible: boolean;
  reason?: string;
  requiredQuantity: number;
  deliveredQuantity: number;
  lastDeliveredAt: Date | null;
};

/**
 * "Every non-cancelled unit on this OrderItem has been delivered." A fully
 * cancelled item (requiredQuantity <= 0) must never be eligible — zero
 * required quantity must not be vacuously satisfied by zero delivered
 * quantity, or cancelling before delivery would create entitlement.
 */
export function computeItemDeliveryCoverage(
  quantity: number,
  cancelledQuantity: number,
  deliveredChunks: DeliveredQuantityChunk[],
): ItemCoverage {
  const requiredQuantity = quantity - cancelledQuantity;
  const deliveredQuantity = deliveredChunks.reduce(
    (sum, chunk) => sum + chunk.quantity,
    0,
  );
  const lastDeliveredAt = deliveredChunks.reduce<Date | null>(
    (latest, chunk) =>
      !latest || chunk.deliveredAt > latest ? chunk.deliveredAt : latest,
    null,
  );

  if (requiredQuantity <= 0) {
    return {
      eligible: false,
      reason: 'Item was fully cancelled before delivery',
      requiredQuantity,
      deliveredQuantity,
      lastDeliveredAt,
    };
  }

  if (deliveredQuantity < requiredQuantity) {
    return {
      eligible: false,
      reason: 'Item has not been fully delivered',
      requiredQuantity,
      deliveredQuantity,
      lastDeliveredAt,
    };
  }

  return { eligible: true, requiredQuantity, deliveredQuantity, lastDeliveredAt };
}

/**
 * A SellerOrder is rating-eligible only when every one of its OrderItems
 * individually clears delivery coverage — one undelivered/cancelled-before-
 * delivery item blocks the whole seller-order rating.
 */
export function computeSellerOrderCoverage(
  itemCoverages: ItemCoverage[],
): { eligible: boolean; reason?: string; lastDeliveredAt: Date | null } {
  if (itemCoverages.length === 0) {
    return {
      eligible: false,
      reason: 'Seller order has no items',
      lastDeliveredAt: null,
    };
  }

  const lastDeliveredAt = itemCoverages.reduce<Date | null>(
    (latest, coverage) =>
      coverage.lastDeliveredAt && (!latest || coverage.lastDeliveredAt > latest)
        ? coverage.lastDeliveredAt
        : latest,
    null,
  );

  const ineligible = itemCoverages.find((coverage) => !coverage.eligible);
  if (ineligible) {
    return { eligible: false, reason: ineligible.reason, lastDeliveredAt };
  }

  return { eligible: true, lastDeliveredAt };
}
