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
