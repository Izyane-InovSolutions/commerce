// Pure, DB-free eligibility/allocation math so it can be unit-tested directly
// (see returns.service.spec.ts) instead of only through Prisma-mocked service
// calls. ReturnsService is the only caller.

export const DEFAULT_RETURN_WINDOW_DAYS = 30;

/** One delivered quantity chunk for an OrderItem — one ShipmentLine on a
 * DELIVERED Shipment, plus however much of it other active returns already
 * claimed. */
export type DeliveredChunk = {
  shipmentLineId: string;
  deliveredAt: Date;
  quantity: number;
  claimedQuantity: number;
};

export type ResolvedChunk = {
  shipmentLineId: string;
  deliveredAt: Date;
  eligibleUntil: Date;
  remainingQuantity: number;
  expired: boolean;
};

export type EligibilityResult = {
  eligible: boolean;
  reason?: string;
  windowDays: number;
  chunks: ResolvedChunk[];
  totalRemainingQuantity: number;
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Per-OrderItem eligibility: not returnable, never delivered, or every
 * delivered chunk either window-expired or fully claimed by another active
 * return all make the item ineligible as a whole.
 */
export function computeItemEligibility(
  isReturnable: boolean,
  returnWindowDays: number | null,
  chunks: DeliveredChunk[],
  now: Date = new Date(),
): EligibilityResult {
  const windowDays = returnWindowDays ?? DEFAULT_RETURN_WINDOW_DAYS;

  if (!isReturnable) {
    return {
      eligible: false,
      reason: 'Item is not returnable',
      windowDays,
      chunks: [],
      totalRemainingQuantity: 0,
    };
  }

  if (chunks.length === 0) {
    return {
      eligible: false,
      reason: 'Item has not been delivered',
      windowDays,
      chunks: [],
      totalRemainingQuantity: 0,
    };
  }

  const resolved: ResolvedChunk[] = [...chunks]
    .sort((a, b) => a.deliveredAt.getTime() - b.deliveredAt.getTime())
    .map((chunk) => {
      const eligibleUntil = addDays(chunk.deliveredAt, windowDays);
      return {
        shipmentLineId: chunk.shipmentLineId,
        deliveredAt: chunk.deliveredAt,
        eligibleUntil,
        remainingQuantity: Math.max(0, chunk.quantity - chunk.claimedQuantity),
        expired: eligibleUntil < now,
      };
    });

  const totalRemainingQuantity = resolved
    .filter((c) => !c.expired)
    .reduce((sum, c) => sum + c.remainingQuantity, 0);

  if (totalRemainingQuantity === 0) {
    return {
      eligible: false,
      reason: 'Return window has expired or the delivered quantity is already claimed by another return',
      windowDays,
      chunks: resolved,
      totalRemainingQuantity: 0,
    };
  }

  return { eligible: true, windowDays, chunks: resolved, totalRemainingQuantity };
}

/**
 * Greedily consumes oldest-delivered-first among non-expired chunks with
 * remaining quantity. Returns null (reject the whole item, never partially
 * fulfill) if the requested quantity cannot be fully satisfied.
 */
export function allocateGreedy(
  chunks: ResolvedChunk[],
  quantity: number,
  now: Date = new Date(),
): { shipmentLineId: string; quantity: number }[] | null {
  const usable = chunks
    .filter((c) => !c.expired && c.eligibleUntil >= now && c.remainingQuantity > 0)
    .sort((a, b) => a.deliveredAt.getTime() - b.deliveredAt.getTime());

  const allocations: { shipmentLineId: string; quantity: number }[] = [];
  let remaining = quantity;
  for (const chunk of usable) {
    if (remaining <= 0) break;
    const take = Math.min(chunk.remainingQuantity, remaining);
    if (take > 0) {
      allocations.push({ shipmentLineId: chunk.shipmentLineId, quantity: take });
      remaining -= take;
    }
  }

  return remaining > 0 ? null : allocations;
}
