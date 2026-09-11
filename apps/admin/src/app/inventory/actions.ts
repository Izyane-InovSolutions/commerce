'use server';

import { revalidatePath } from 'next/cache';

import { adjustInventory } from '@commerce/api-client';
import { inventoryAdjustmentReasonSchema } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

export async function adjustInventoryAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const reason = inventoryAdjustmentReasonSchema.safeParse(
    formData.get('reason'),
  );
  if (!reason.success) {
    return { status: 'error', message: 'Choose a reason for the adjustment.' };
  }

  const delta = Number(formData.get('delta'));
  if (!Number.isInteger(delta) || delta === 0) {
    return {
      status: 'error',
      fieldErrors: { delta: ['Enter a non-zero whole number.'] },
    };
  }

  try {
    await adjustInventory(apiClient, {
      skuId: String(formData.get('skuId') ?? ''),
      locationId: String(formData.get('locationId') ?? ''),
      delta,
      reason: reason.data,
      note: String(formData.get('note') ?? ''),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/inventory');
  return { status: 'idle', message: 'Stock adjusted.' };
}
