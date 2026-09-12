import type { Price } from '@prisma/client';

/**
 * The currencies the platform prices and settles in.
 *
 * Kept here because price resolution is where the list actually bites: an
 * offer is only sellable in a currency it carries a price for, and the
 * payment gateway routes on currency too — mobile money settles in ZMW, its
 * card connector in USD or GBP.
 */
export const SUPPORTED_CURRENCIES = ['ZMW', 'USD', 'GBP'] as const;

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
 * The price in force in every currency the offer is priced in.
 *
 * For callers that ask "is this sellable at all?" rather than "what does it
 * cost in Kwacha?" — publishing a listing, for instance, needs one currency
 * to have a price, not a particular one.
 */
export function currentPrices(prices: Price[], at: Date = new Date()): Price[] {
  const byCurrency = new Map<string, Price>();

  for (const price of prices.filter((price) => isCurrent(price, at))) {
    const held = byCurrency.get(price.currency);
    if (!held || newestFirst(price, held) < 0) {
      byCurrency.set(price.currency, price);
    }
  }

  return [...byCurrency.values()];
}
