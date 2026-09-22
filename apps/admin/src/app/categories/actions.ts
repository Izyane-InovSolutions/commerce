'use server';

import { revalidatePath } from 'next/cache';

import {
  backendCreateCategory,
  backendDeleteCategory,
  backendUpdateCategory,
} from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

function revalidateTaxonomy(): void {
  revalidatePath('/categories');
  revalidatePath('/catalog');
}

/** The API rejects an empty string where it expects a UUID, so blanks go out. */
function optionalId(value: FormDataEntryValue | null): string | undefined {
  const id = String(value ?? '').trim();
  return id === '' ? undefined : id;
}

export async function createCategoryAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await backendCreateCategory(apiClient, {
      name: String(formData.get('name') ?? '').trim(),
      slug: String(formData.get('slug') ?? '').trim(),
      parentId: optionalId(formData.get('parentId')),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateTaxonomy();
  return { status: 'idle', message: 'Category added.' };
}

export async function updateCategoryAction(
  categoryId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await backendUpdateCategory(apiClient, categoryId, {
      name: String(formData.get('name') ?? '').trim(),
      slug: String(formData.get('slug') ?? '').trim(),
      parentId: optionalId(formData.get('parentId')),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateTaxonomy();
  return { status: 'idle', message: 'Saved.' };
}

export async function deleteCategoryAction(
  categoryId: string,
): Promise<FormState> {
  try {
    await backendDeleteCategory(apiClient, categoryId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateTaxonomy();
  return { status: 'idle', message: 'Category removed.' };
}
