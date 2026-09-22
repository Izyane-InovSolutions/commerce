'use server';

import { revalidatePath } from 'next/cache';

import {
  backendAdjustStock,
  backendCreateWarehouse,
  backendReceiveStock,
} from '@commerce/api-client';

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

/**
 * Opens a warehouse.
 *
 * Stock cannot exist without one: an inventory record is keyed by variant and
 * warehouse, so the first warehouse is what makes receiving possible at all.
 */
export async function createWarehouseAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await backendCreateWarehouse(apiClient, {
      name: String(formData.get('name') ?? '').trim(),
      code: String(formData.get('code') ?? '')
        .trim()
        .toUpperCase(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/inventory');
  return { status: 'idle', message: 'Warehouse created.' };
}

/**
 * Receives stock for a variant that has no record yet.
 *
 * The per-row form can only move stock that already exists, which leaves the
 * first receipt for any variant with nowhere to happen — this is that first
 * receipt. The API creates the record on the way in.
 */
export async function receiveStockAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const quantity = Number(formData.get('quantity'));
  if (!Number.isInteger(quantity) || quantity < 1) {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: { quantity: ['Enter a whole number above zero.'] },
    };
  }

  const warehouseId = String(formData.get('warehouseId') ?? '');
  const variantId = String(formData.get('variantId') ?? '');

  if (warehouseId === '' || variantId === '') {
    return {
      status: 'error',
      message: 'Choose both a warehouse and a variant.',
    };
  }

  try {
    await backendReceiveStock(apiClient, {
      warehouseId,
      variantId,
      quantity,
      note: String(formData.get('note') ?? '') || undefined,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/inventory');
  return { status: 'idle', message: 'Stock received.' };
}
