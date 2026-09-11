'use server';

import { revalidatePath } from 'next/cache';

import {
  createCategory,
  deleteCategory,
  updateCategory,
} from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

function revalidateTaxonomy(): void {
  revalidatePath('/categories');
  // The product forms in both portals read the taxonomy.
  revalidatePath('/catalog');
}

export async function createCategoryAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await createCategory(apiClient, {
      name: String(formData.get('name') ?? '').trim(),
      slug: String(formData.get('slug') ?? '').trim(),
      parentId: (formData.get('parentId') as string) || null,
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
    await updateCategory(apiClient, categoryId, {
      name: String(formData.get('name') ?? '').trim(),
      slug: String(formData.get('slug') ?? '').trim(),
      // An empty select means top level, which is a real choice here.
      parentId: (formData.get('parentId') as string) || null,
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
    await deleteCategory(apiClient, categoryId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateTaxonomy();
  return { status: 'idle', message: 'Category removed.' };
}
