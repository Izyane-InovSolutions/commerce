'use server';

import { revalidatePath } from 'next/cache';

import { isSupportedCurrency, writeCurrency } from '@/lib/currency-cookie';

/**
 * Switches the currency prices are shown in. Every price on a page is the
 * one the API resolved for the currency cookie, so the whole tree is
 * revalidated rather than any one page.
 */
export async function setCurrencyAction(formData: FormData): Promise<void> {
  const currency = String(formData.get('currency') ?? '');
  if (!isSupportedCurrency(currency)) {
    return;
  }

  await writeCurrency(currency);
  revalidatePath('/', 'layout');
}
