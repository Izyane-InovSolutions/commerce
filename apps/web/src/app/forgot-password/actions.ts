'use server';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

export async function requestPasswordResetAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await apiClient.post('/auth/password-reset/request', {
      body: { email: String(formData.get('email') ?? '').trim() },
    });
    return {
      status: 'idle',
      message:
        'If an account exists for that address, a reset link is on its way.',
    };
  } catch (error) {
    return toFormState(error);
  }
}
