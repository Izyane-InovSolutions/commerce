const currencyFormatter = new Intl.NumberFormat('en-ZM', {
  style: 'currency',
  currency: 'ZMW',
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}
