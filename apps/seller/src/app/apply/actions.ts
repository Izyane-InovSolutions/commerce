'use server';

import { revalidatePath } from 'next/cache';

import { createSellerApplication } from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

export async function applyAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await createSellerApplication(apiClient, {
      displayName: String(formData.get('displayName') ?? '').trim(),
      slug: String(formData.get('slug') ?? '').trim(),
      contactEmail: String(formData.get('contactEmail') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/apply');
  revalidatePath('/');
  return { status: 'idle', message: 'Application submitted for review.' };
}
