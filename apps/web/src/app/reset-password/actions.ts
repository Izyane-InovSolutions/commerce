'use server';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

export async function confirmPasswordResetAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const newPassword = String(formData.get('newPassword') ?? '');
  if (newPassword !== String(formData.get('confirmPassword') ?? '')) {
    return {
      status: 'error',
      fieldErrors: { confirmPassword: ['Passwords do not match'] },
    };
  }

  try {
    await apiClient.post('/auth/password-reset/confirm', {
      body: {
        token: String(formData.get('token') ?? ''),
        newPassword,
      },
    });
    return {
      status: 'idle',
      message: 'Your password has been reset. You can now sign in.',
    };
  } catch (error) {
    return toFormState(error);
  }
}
