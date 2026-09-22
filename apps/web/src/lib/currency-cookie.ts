import { cookies } from 'next/headers';

import { backendCurrencies, defaultBackendCurrency } from '@commerce/contracts';

/**
 * The currency the shopper is browsing in.
 *
 * Kept in a cookie rather than the URL so it survives navigation without
 * appearing in every link, and read server-side so the price a page renders
 * is already the one the API resolved — there is no client-side conversion
 * anywhere, and no moment where a page shows one currency's number under
 * another's symbol.
 */
export const CURRENCY_COOKIE = 'commerce_web_currency';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function isSupportedCurrency(value: string): boolean {
  return (backendCurrencies as readonly string[]).includes(value);
}

export async function readCurrency(): Promise<string> {
  const stored = (await cookies()).get(CURRENCY_COOKIE)?.value;
  return stored && isSupportedCurrency(stored)
    ? stored
    : defaultBackendCurrency;
}

/** Writable only from a server action, as with every cookie this app sets. */
export async function writeCurrency(currency: string): Promise<void> {
  (await cookies()).set(CURRENCY_COOKIE, currency, {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
}
