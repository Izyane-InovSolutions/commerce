import type { Price } from '@prisma/client';

// The current price is whichever row's window covers `at`; if windows
// overlap, the most recently started one wins.
export function pickCurrentPrice(
  prices: Price[],
  at: Date = new Date(),
): Price | undefined {
  return prices
    .filter(
      (price) => price.startsAt <= at && (!price.endsAt || price.endsAt > at),
    )
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
}
