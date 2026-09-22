import type { Price } from '@prisma/client';

/**
 * Commerce prices and balances use ZMW only. Foreign payment settlement is
 * handled privately by the payment provider.
 */
export const SUPPORTED_CURRENCIES = ['ZMW'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: SupportedCurrency = 'ZMW';

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

function isCurrent(price: Price, at: Date): boolean {
  return price.startsAt <= at && (!price.endsAt || price.endsAt > at);
}

// Most recently started wins where windows overlap.
function newestFirst(left: Price, right: Price): number {
  return right.startsAt.getTime() - left.startsAt.getTime();
}

/**
 * The price in force for one currency.
 *
 * Currency is required rather than optional on purpose: an offer may carry
 * prices in several currencies at once, and picking across them by start date
 * alone would hand back whichever was edited last — a shopper browsing in
 * Kwacha would see a pound price simply because it was added more recently.
 */
export function pickCurrentPrice(
  prices: Price[],
  currency: string,
  at: Date = new Date(),
): Price | undefined {
  return prices
    .filter((price) => price.currency === currency && isCurrent(price, at))
    .sort(newestFirst)[0];
}

/**
 * Current ZMW prices. Historical foreign prices cannot qualify an offer for
 * publication or purchase.
 */
export function currentPrices(prices: Price[], at: Date = new Date()): Price[] {
  const byCurrency = new Map<string, Price>();

  for (const price of prices.filter(
    (price) => price.currency === DEFAULT_CURRENCY && isCurrent(price, at),
  )) {
    const held = byCurrency.get(price.currency);
    if (!held || newestFirst(price, held) < 0) {
      byCurrency.set(price.currency, price);
    }
  }

  return [...byCurrency.values()];
}
