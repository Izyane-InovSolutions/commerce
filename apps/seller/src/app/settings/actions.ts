'use server';

import { revalidatePath } from 'next/cache';

import { backendUpdateStorefront } from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

/**
 * Saves the storefront.
 *
 * The API replaces all of it on every write, so this posts every field — and
 * the version it read them at, which is what stops one tab's save from
 * quietly reverting another's.
 */
export async function updateStorefrontAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await backendUpdateStorefront(apiClient, {
      version: Number(formData.get('version')),
      storefrontSlug: String(formData.get('storefrontSlug') ?? '').trim(),
      displayName: String(formData.get('displayName') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/settings');
  revalidatePath('/');
  return { status: 'idle', message: 'Storefront saved.' };
}
