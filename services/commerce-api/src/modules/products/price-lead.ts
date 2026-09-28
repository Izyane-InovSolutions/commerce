/**
 * How far below the next-cheapest seller an offer has to be before it's
 * called the best price. Below this, a few ngwee of undercutting isn't a
 * deal worth a shelf.
 */
export const PRICE_LEAD_MIN_SHARE = 0.05;

type Money = { amount: number; currency: string };

type LeadCandidate = {
  currentPrice: Money | null;
  inStock: boolean;
};

/** The offer is the cheapest in-stock one for its variant by at least
 * PRICE_LEAD_MIN_SHARE; `nextLowestPrice` is the runner-up it beats. */
export type PriceLead = { nextLowestPrice: Money; sellerCount: number };

/**
 * Marks the one offer (if any) that undercuts every other in-stock seller
 * of the same variant, in the same currency, by at least the threshold.
 *
 * The comparison is against another seller's *current* price, never a
 * price this offer used to charge — so it's shown as "less than other
 * sellers", not as a struck-through "was" price.
 */
export function withPriceLeads<T extends LeadCandidate>(
  offers: T[],
): (T & { priceLead: PriceLead | null })[] {
  const marked: (T & { priceLead: PriceLead | null })[] = offers.map(
    (offer) => ({ ...offer, priceLead: null }),
  );
  const priced = marked
    .filter((offer) => offer.inStock && offer.currentPrice)
    .sort(
      (left, right) => left.currentPrice!.amount - right.currentPrice!.amount,
    );
  if (priced.length < 2) return marked;

  const [lowest, next] = priced as [
    (typeof marked)[number],
    (typeof marked)[number],
  ];
  const price = lowest.currentPrice!;
  const runnerUp = next.currentPrice!;
  if (price.currency !== runnerUp.currency) return marked;
  if (price.amount > runnerUp.amount * (1 - PRICE_LEAD_MIN_SHARE))
    return marked;

  return marked.map((offer) =>
    offer === lowest
      ? {
          ...offer,
          priceLead: { nextLowestPrice: runnerUp, sellerCount: priced.length },
        }
      : offer,
  );
}

/** Share of the runner-up's price the lead saves, e.g. 0.08 for 8%. */
export function priceLeadShare(price: Money, lead: PriceLead): number {
  return 1 - price.amount / lead.nextLowestPrice.amount;
}
