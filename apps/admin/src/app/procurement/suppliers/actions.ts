'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  backendCreateSupplier,
  backendDeactivateSupplier,
  backendUpdateSupplier,
} from '@commerce/api-client';
import type { BackendSupplier } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import { supplierCreateInput, supplierUpdateInput } from '@/lib/procurement';
import { guardAction } from '@/lib/session';

/*
 * Every supplier route is `@Roles(STAFF, ADMIN)` in the API, so none of
 * these is admin-only here either.
 */

function revalidateSuppliers(supplierId?: string): void {
  revalidatePath('/procurement/suppliers');
  if (supplierId) {
    revalidatePath(`/procurement/suppliers/${supplierId}`);
  }
}

export async function createSupplierAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  const { input, fieldErrors } = supplierCreateInput(formData);
  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors,
    };
  }

  let supplierId: string;
  try {
    supplierId = (await backendCreateSupplier(apiClient, input)).id;
  } catch (error) {
    return toFormState(error);
  }

  revalidateSuppliers();
  redirect(`/procurement/suppliers/${supplierId}`);
}

/**
 * The version and currency are the ones the page rendered: a stale version
 * is refused by the API, and the currency is what a minimum order is in,
 * since a supplier's default currency is fixed once it exists.
 */
export async function updateSupplierAction(
  supplier: Pick<BackendSupplier, 'id' | 'version' | 'defaultCurrency'>,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  const { input, fieldErrors } = supplierUpdateInput(formData, supplier);
  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors,
    };
  }

  try {
    await backendUpdateSupplier(apiClient, supplier.id, input);
  } catch (error) {
    return toFormState(error);
  }

  revalidateSuppliers(supplier.id);
  return { status: 'idle', message: 'Supplier saved.' };
}

/**
 * The API has no reactivate route: deactivating is one-way, which is why the
 * page asks for confirmation before offering this.
 */
export async function deactivateSupplierAction(
  supplierId: string,
  version: number,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendDeactivateSupplier(apiClient, supplierId, { version });
  } catch (error) {
    return toFormState(error);
  }

  revalidateSuppliers(supplierId);
  return { status: 'idle', message: 'Supplier deactivated.' };
}
