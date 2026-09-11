const currencyFormatter = new Intl.NumberFormat('en-ZM', {
  style: 'currency',
  currency: 'ZMW',
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

/**
 * Formats an amount the API returned.
 *
 * The API works in minor units and names its own currency — `1250` and `ZMW`
 * is K12.50 — so amounts from it go through this rather than
 * `formatCurrency`, which takes whole Kwacha and assumes the currency.
 */
export function formatMinor(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}
