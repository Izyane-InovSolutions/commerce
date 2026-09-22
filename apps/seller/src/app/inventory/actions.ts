'use server';

import { revalidatePath } from 'next/cache';

import { backendSetSellerInventory } from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

/**
 * Sets one self-managed offer's on-hand quantity.
 *
 * This is the only write a seller has over their own stock — there's no
 * warehouse to receive into, just the number they currently hold. The API
 * rejects a stale `version` (another tab, or a concurrent edit) rather than
 * overwriting it, which surfaces here as an ordinary form error.
 */
export async function setInventoryAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const quantity = Number(formData.get('quantity'));
  if (!Number.isInteger(quantity) || quantity < 0) {
    return {
      status: 'error',
      fieldErrors: { quantity: ['Enter a whole number of 0 or more.'] },
    };
  }

  const offerId = String(formData.get('offerId') ?? '');
  const version = Number(formData.get('version'));

  try {
    await backendSetSellerInventory(apiClient, offerId, {
      quantity,
      version,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/inventory');
  return { status: 'idle', message: 'Stock updated.' };
}
