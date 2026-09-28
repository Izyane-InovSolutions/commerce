/**
 * A "sale until" date from the price form, as the instant the sale price
 * stops: the end of that day in Lusaka (UTC+2, no daylight saving), so
 * "until 5 Oct" includes all of 5 October for shoppers here.
 *
 * Blank means no end date (an ordinary price change). A malformed date, or
 * one that isn't after today, is `'invalid'`.
 */
export function saleEndsAt(
  value: string,
  now: Date = new Date(),
): string | null | 'invalid' {
  const date = value.trim();
  if (date === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'invalid';

  const endsAt = new Date(`${date}T23:59:59+02:00`);
  if (Number.isNaN(endsAt.getTime()) || endsAt <= now) return 'invalid';
  return endsAt.toISOString();
}
