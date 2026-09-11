import { z } from 'zod';

/**
 * A monetary amount in the currency's minor unit — 1250 GBP minor units is
 * £12.50. Money never crosses the wire as a float, so no rounding error can be
 * introduced between the API and a client.
 */
export const moneySchema = z.object({
  amountMinor: z.int(),
  currency: z.string().length(3),
});

export type Money = z.infer<typeof moneySchema>;

export function money(amountMinor: number, currency = 'GBP'): Money {
  return { amountMinor, currency };
}

/** Formats money for display in the given locale. */
export function formatMoney(value: Money, locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
  }).format(value.amountMinor / 100);
}

/** Parses a decimal string such as `"12.50"` into minor units. */
export function parseMoneyInput(input: string, currency = 'GBP'): Money | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }

  return money(Math.round(Number(trimmed) * 100), currency);
}

/** The page of results every list endpoint returns. */
export const paginationSchema = z.object({
  page: z.int().min(1),
  pageSize: z.int().min(1),
  total: z.int().min(0),
  totalPages: z.int().min(0),
});

export type Pagination = z.infer<typeof paginationSchema>;

export type Paginated<T> = Pagination & {
  items: T[];
};

/** Query parameters accepted by every list endpoint. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export const DEFAULT_PAGE_SIZE = 20;
