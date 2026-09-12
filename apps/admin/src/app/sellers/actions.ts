'use server';

import { revalidatePath } from 'next/cache';

import {
  backendApproveSeller,
  backendRejectSeller,
  backendSuspendSeller,
} from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

const REVIEWERS = {
  approve: backendApproveSeller,
  reject: backendRejectSeller,
  suspend: backendSuspendSeller,
} as const;

type Decision = keyof typeof REVIEWERS;

const CONFIRMATIONS: Record<Decision, string> = {
  approve: 'Seller approved.',
  reject: 'Seller rejected.',
  suspend: 'Seller suspended.',
};

function isDecision(value: string): value is Decision {
  return value in REVIEWERS;
}

/**
 * Approve, reject, or suspend a seller.
 *
 * All three are one review call under three paths, so which button was
 * pressed arrives as a form value rather than as three near-identical
 * actions. The version is the one the page rendered: the API rejects a stale
 * one, which is what stops two administrators from each deciding against a
 * different view of the same seller.
 */
export async function reviewSellerAction(
  sellerId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const decision = String(formData.get('decision') ?? '');
  if (!isDecision(decision)) {
    return { status: 'error', message: 'Choose a decision.' };
  }

  try {
    await REVIEWERS[decision](apiClient, sellerId, {
      version: Number(formData.get('version')),
      reason: String(formData.get('reason') ?? '').trim(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/sellers');
  revalidatePath(`/sellers/${sellerId}`);
  return { status: 'idle', message: CONFIRMATIONS[decision] };
}
