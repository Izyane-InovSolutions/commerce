'use server';

import { revalidatePath } from 'next/cache';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

export async function confirmEmailVerificationAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await apiClient.post('/auth/email-verification/confirm', {
      body: { token: String(formData.get('token') ?? '') },
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/account');
  return { status: 'idle', message: 'Your email address is now verified.' };
}
