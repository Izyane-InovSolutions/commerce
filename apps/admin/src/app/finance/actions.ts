'use server';

import { revalidatePath } from 'next/cache';

import { backendRecordPayout } from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import { toMinor } from '@/lib/money';

/**
 * Records that a seller was paid.
 *
 * This is bookkeeping: it debits the seller's ledger to match a transfer that
 * happened by some other means. Nothing here moves money, so a duplicate
 * submission would quietly understate what the seller is owed — hence the
 * idempotency key the form carries, which makes a retry of the same payout a
 * no-op rather than a second debit.
 */
export async function recordPayoutAction(
  sellerId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const amount = toMinor(String(formData.get('amount') ?? ''));
  if (!Number.isFinite(amount) || amount < 1) {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: { amount: ['Enter an amount above zero.'] },
    };
  }

  const reference = String(formData.get('reference') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const idempotencyKey = String(formData.get('idempotencyKey') ?? '').trim();

  try {
    await backendRecordPayout(
      apiClient,
      sellerId,
      {
        amount,
        reference: reference === '' ? undefined : reference,
        note: note === '' ? undefined : note,
      },
      idempotencyKey === '' ? undefined : idempotencyKey,
    );
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/finance');
  revalidatePath(`/sellers/${sellerId}`);
  return { status: 'idle', message: 'Payout recorded.' };
}
