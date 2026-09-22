/**
 * Which ways of paying an order of a given currency can actually use.
 *
 * Orders are always priced in ZMW. Mobile money settles in ZMW directly; the
 * card connector settles in USD or GBP, but the gateway converts a ZMW order
 * into that settlement currency itself, so both methods are available for a
 * ZMW order and neither is for anything else.
 */
export const ORDER_CURRENCY = 'ZMW';

export type PaymentMethod = 'mobile-money' | 'card';

export function availablePaymentMethods(currency: string): PaymentMethod[] {
  return currency === ORDER_CURRENCY ? ['mobile-money', 'card'] : [];
}

/** Why a method is missing, in words a shopper can act on. */
export function unavailableReason(
  _method: PaymentMethod,
  currency: string,
): string {
  return `Orders must be priced in ${ORDER_CURRENCY}; this order is priced in ${currency}.`;
}

export type MobileNetwork = 'MTN' | 'AIRTEL';

/** Zambian mobile numbers carry their carrier in the first three digits. */
const NETWORK_PREFIXES: Record<MobileNetwork, readonly string[]> = {
  MTN: ['076', '096'],
  AIRTEL: ['077', '097'],
};

/**
 * The carrier a Zambian mobile money number belongs to, from its prefix.
 *
 * Null once three digits are typed but match neither carrier this app
 * supports (Zamtel, say) — the shopper is asked to pick one themselves
 * rather than being told something plainly untrue.
 */
export function detectMobileNetwork(phone: string): MobileNetwork | null {
  const prefix = phone.replace(/\D/g, '').slice(0, 3);

  if (prefix.length < 3) {
    return null;
  }

  const network = (Object.keys(NETWORK_PREFIXES) as MobileNetwork[]).find(
    (candidate) => NETWORK_PREFIXES[candidate].includes(prefix),
  );

  return network ?? null;
}
