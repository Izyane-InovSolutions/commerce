'use server';

import { revalidatePath } from 'next/cache';

import { backendAdjustStock, backendReceiveStock } from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

/**
 * Moves stock for one variant at one warehouse.
 *
 * `receive` adds a positive quantity; `adjust` applies a signed correction.
 * Both are recorded as movements, so the running total stays auditable.
 */
export async function moveStockAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const delta = Number(formData.get('delta'));
  if (!Number.isInteger(delta) || delta === 0) {
    return {
      status: 'error',
      fieldErrors: { delta: ['Enter a non-zero whole number.'] },
    };
  }

  const target = {
    warehouseId: String(formData.get('warehouseId') ?? ''),
    variantId: String(formData.get('variantId') ?? ''),
    note: String(formData.get('note') ?? '') || undefined,
  };

  try {
    await (formData.get('mode') === 'receive'
      ? backendReceiveStock(apiClient, { ...target, quantity: delta })
      : backendAdjustStock(apiClient, { ...target, delta }));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/inventory');
  return { status: 'idle', message: 'Stock updated.' };
}
