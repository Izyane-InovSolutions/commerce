/**
 * Which ways of paying an order of a given currency can actually use.
 *
 * The gateway routes by currency as much as by choice: mobile money settles
 * in ZMW, and its card connector takes USD or GBP. Offering a method the
 * gateway will refuse only produces a failed payment at the last step, so
 * checkout asks this first and shows what is left.
 */
export const MOBILE_MONEY_CURRENCY = 'ZMW';
export const CARD_CURRENCIES = ['USD', 'GBP'];

export type PaymentMethod = 'mobile-money' | 'card';

export function availablePaymentMethods(currency: string): PaymentMethod[] {
  const methods: PaymentMethod[] = [];

  if (currency === MOBILE_MONEY_CURRENCY) {
    methods.push('mobile-money');
  }
  if (CARD_CURRENCIES.includes(currency)) {
    methods.push('card');
  }

  return methods;
}

/** Why a method is missing, in words a shopper can act on. */
export function unavailableReason(
  method: PaymentMethod,
  currency: string,
): string {
  return method === 'card'
    ? `Card payments settle in ${CARD_CURRENCIES.join(' or ')}; this order is priced in ${currency}.`
    : `Mobile money settles in ${MOBILE_MONEY_CURRENCY}; this order is priced in ${currency}.`;
}
