/** The largest value a PostgreSQL `integer` (int4) column can hold. */
export const MAX_INT4 = 2_147_483_647;

/**
 * One allocatable stock pool: a seller-stocked offer draws only from its own
 * record, a platform-stocked offer from every warehouse record of its
 * variant. Mirrors which records `InventoryService.reserve`/`reserveOffer`
 * consider for a line.
 */
export type StockPoolKey =
  | { kind: 'variant'; variantId: string }
  | { kind: 'offer'; offerId: string };

export function stockPoolKey(pool: StockPoolKey): string {
  return pool.kind === 'offer'
    ? `offer:${pool.offerId}`
    : `variant:${pool.variantId}`;
}

/**
 * Whether `demands` fit `available` under the same rule checkout reserves
 * with: each demand, in the order given, is served whole by the first record
 * (in the order of `available`, i.e. ascending record id) with enough
 * remaining stock — never split across records. So a pool whose total is
 * large enough can still refuse a line no single record can hold.
 */
export function canAllocateFirstFit(
  available: number[],
  demands: number[],
): boolean {
  const remaining = [...available];

  for (const demand of demands) {
    if (demand <= 0) continue;
    const index = remaining.findIndex((quantity) => quantity >= demand);
    if (index === -1) return false;
    remaining[index] = (remaining[index] ?? 0) - demand;
  }

  return true;
}
