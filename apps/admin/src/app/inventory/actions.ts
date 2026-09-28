'use server';

import { revalidatePath } from 'next/cache';

import {
  ApiError,
  backendAdjustStock,
  backendCreateWarehouse,
  backendDeleteWarehouse,
  backendListInventory,
  backendReceiveStock,
  backendUpdateReorderPoint,
  backendUpdateWarehouse,
} from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import { guardAction } from '@/lib/session';

import { warehouseDeleteBlocker } from './warehouse-rules';

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
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

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
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

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
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

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

/**
 * Renames, recodes, or (de)activates a warehouse.
 *
 * The form always renders the active checkbox, so its absence from the post
 * means it was unticked rather than left out.
 */
export async function updateWarehouseAction(
  warehouseId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendUpdateWarehouse(apiClient, warehouseId, {
      name: String(formData.get('name') ?? '').trim(),
      code: String(formData.get('code') ?? '')
        .trim()
        .toUpperCase(),
      isActive: formData.get('isActive') === 'on',
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/inventory', 'layout');
  return { status: 'idle', message: 'Saved.' };
}

/**
 * Deletes a warehouse that has never held stock.
 *
 * See `warehouseDeleteBlocker` for why the portal refuses what the API would
 * allow. The records are read fresh here rather than trusted from the page,
 * so stock received since the page rendered still counts. What the API itself
 * refuses — a warehouse that purchase orders, fulfilment or returns point at —
 * comes back as a bare server error, so that case is reworded.
 */
export async function deleteWarehouseAction(
  warehouseId: string,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    const blocker = warehouseDeleteBlocker(
      warehouseId,
      await backendListInventory(apiClient),
    );
    if (blocker) {
      return { status: 'error', message: blocker };
    }

    await backendDeleteWarehouse(apiClient, warehouseId);
  } catch (error) {
    if (error instanceof ApiError && error.status >= 500) {
      return {
        status: 'error',
        message:
          'The API refused to delete this warehouse — purchase orders, fulfilment, or returns probably still reference it. Deactivate it instead.',
      };
    }
    return toFormState(error);
  }

  revalidatePath('/inventory', 'layout');
  return { status: 'idle', message: 'Warehouse deleted.' };
}

/**
 * Sets the level at which a record counts as due for restocking. Zero turns
 * the flag off for that record.
 */
export async function updateReorderPointAction(
  inventoryRecordId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  const raw = String(formData.get('reorderPoint') ?? '').trim();
  const reorderPoint = Number(raw);
  if (raw === '' || !Number.isInteger(reorderPoint) || reorderPoint < 0) {
    return {
      status: 'error',
      fieldErrors: { reorderPoint: ['Enter a whole number, zero or more.'] },
    };
  }

  try {
    await backendUpdateReorderPoint(apiClient, inventoryRecordId, reorderPoint);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/inventory', 'layout');
  return { status: 'idle', message: 'Reorder point saved.' };
}
