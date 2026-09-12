'use server';

import { revalidatePath } from 'next/cache';

import { isSupportedCurrency, writeCurrency } from '@/lib/currency-cookie';

/**
 * Switches the currency the storefront prices in.
 *
 * Everything is re-read from the API afterwards rather than converted here:
 * a product sells at the price it carries in that currency, or it does not
 * sell in it at all. There is no exchange rate anywhere in this system.
 */
export async function setCurrencyAction(formData: FormData): Promise<void> {
  const currency = String(formData.get('currency') ?? '');

  if (!isSupportedCurrency(currency)) {
    return;
  }

  await writeCurrency(currency);
  revalidatePath('/', 'layout');
}
