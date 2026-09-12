/**
 * The API stores and returns money in minor units — 12345 is K123.45 — so
 * every amount is divided before it is shown, never after.
 */
export function formatMinor(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(
    amount / 100,
  );
}

/** Parses a typed amount like "123.45" back into minor units. */
export function toMinor(value: string): number {
  const amount = Number(value.trim().replace(/,/g, ''));
  return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
}
