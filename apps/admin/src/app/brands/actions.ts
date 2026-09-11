'use server';

import { revalidatePath } from 'next/cache';

import { createBrand, deleteBrand, updateBrand } from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

function revalidateTaxonomy(): void {
  revalidatePath('/brands');
  revalidatePath('/catalog');
}

export async function createBrandAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await createBrand(apiClient, {
      name: String(formData.get('name') ?? '').trim(),
      slug: String(formData.get('slug') ?? '').trim(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateTaxonomy();
  return { status: 'idle', message: 'Brand added.' };
}

export async function updateBrandAction(
  brandId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await updateBrand(apiClient, brandId, {
      name: String(formData.get('name') ?? '').trim(),
      slug: String(formData.get('slug') ?? '').trim(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateTaxonomy();
  return { status: 'idle', message: 'Saved.' };
}

export async function deleteBrandAction(brandId: string): Promise<FormState> {
  try {
    await deleteBrand(apiClient, brandId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateTaxonomy();
  return { status: 'idle', message: 'Brand removed.' };
}
