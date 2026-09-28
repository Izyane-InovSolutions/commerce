/**
 * The API stores and returns money in minor units — 12345 is K123.45 — so
 * every amount is divided before it is shown, never after.
 */
export function formatMinor(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(
    amount / 100,
  );
}

/**
 * Totals a set of amounts per currency.
 *
 * Minor units only add up within one currency — K100 and $100 are not 200 of
 * anything — so a mixed set comes back as one total per currency, in
 * alphabetical order so the same rows always read the same way.
 */
export function totalsByCurrency(
  rows: readonly { amount: number; currency: string }[],
): { currency: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency.toUpperCase();
    totals.set(currency, (totals.get(currency) ?? 0) + row.amount);
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount }));
}

/** Parses a typed amount like "123.45" back into minor units. */
export function toMinor(value: string): number {
  const amount = Number(value.trim().replace(/,/g, ''));
  return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
}
