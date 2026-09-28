'use server';

import { revalidatePath } from 'next/cache';

import {
  backendGetPayoutBatch,
  backendGetPayoutRequest,
  backendProcessPayoutBatch,
  backendResolvePayoutRequest,
  backendReviewPayoutRequest,
  backendVerifyPayoutAccount,
  type BackendPayoutRequestReview,
} from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import { buildResolveInput, latestAttemptReference } from '@/lib/payouts';
import { guardAction } from '@/lib/session';

/*
 * Every payout route is ADMIN-only on the API (`@Roles(Role.ADMIN)` on
 * `AdminPayoutsController`), so every action here guards for it too.
 *
 * Reviews and resolutions are idempotency-keyed: the page mints a key per
 * render and the form posts it back, so a double submit replays one decision
 * instead of failing the second on a stale version.
 */

function revalidatePayouts(): void {
  revalidatePath('/finance/payouts', 'layout');
}

function readKey(formData: FormData): string {
  return String(formData.get('idempotencyKey') ?? '').trim();
}

const REVIEW_MESSAGES: Record<BackendPayoutRequestReview, string> = {
  approve: 'Approved. It will go out with the next batch.',
  reject: 'Rejected. The amount is back in the seller’s available balance.',
  retry: 'Queued again. It will go out with the next batch.',
};

function isReview(value: string): value is BackendPayoutRequestReview {
  return value === 'approve' || value === 'reject' || value === 'retry';
}

export async function reviewPayoutRequestAction(
  id: string,
  version: number,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const decision = String(formData.get('decision') ?? '');
  if (!isReview(decision)) {
    return { status: 'error', message: 'Choose a decision.' };
  }
  const reason = String(formData.get('reason') ?? '').trim();
  if (decision === 'reject' && reason === '') {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: { reason: ['Say why — the seller sees this reason.'] },
    };
  }

  try {
    await backendReviewPayoutRequest(
      apiClient,
      id,
      decision,
      { version, reason: reason === '' ? undefined : reason },
      readKey(formData),
    );
  } catch (error) {
    return toFormState(error);
  }
  revalidatePayouts();
  return { status: 'idle', message: REVIEW_MESSAGES[decision] };
}

/**
 * Reconciles a request the manual provider handed back: either the admin
 * made the transfer (paid, debiting the ledger) or it did not happen
 * (failed, releasing the amount back to the seller).
 */
export async function resolvePayoutRequestAction(
  id: string,
  version: number,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  let message: string;
  try {
    const request = await backendGetPayoutRequest(apiClient, id);
    const built = buildResolveInput(
      {
        outcome: String(formData.get('outcome') ?? ''),
        providerReference: String(formData.get('providerReference') ?? ''),
        note: String(formData.get('note') ?? ''),
        version,
      },
      latestAttemptReference(request),
    );
    if (!built.ok) {
      return {
        status: 'error',
        message: 'Check the form and try again.',
        fieldErrors: built.fieldErrors,
      };
    }
    await backendResolvePayoutRequest(
      apiClient,
      id,
      built.input,
      readKey(formData),
    );
    message =
      built.input.outcome === 'SUCCEEDED'
        ? 'Marked as paid. The seller’s ledger has been debited.'
        : 'Marked as failed. The amount is back in the seller’s available balance.';
  } catch (error) {
    return toFormState(error);
  }
  revalidatePayouts();
  return { status: 'idle', message };
}

export async function verifyPayoutAccountAction(
  id: string,
  version: number,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const decision = String(formData.get('decision') ?? '');
  if (decision !== 'VERIFIED' && decision !== 'REJECTED') {
    return { status: 'error', message: 'Choose verify or reject.' };
  }
  const note = String(formData.get('note') ?? '').trim();
  if (decision === 'REJECTED' && note === '') {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: { note: ['Say what the seller needs to correct.'] },
    };
  }

  try {
    await backendVerifyPayoutAccount(apiClient, id, {
      status: decision,
      note,
      version,
    });
  } catch (error) {
    return toFormState(error);
  }
  revalidatePayouts();
  return {
    status: 'idle',
    message: decision === 'VERIFIED' ? 'Account verified.' : 'Account rejected.',
  };
}

/**
 * Claims every approved, unbatched request into a batch and submits each to
 * the provider. With the manual provider nothing is sent: every request
 * comes back needing reconciliation, and the message says so.
 */
export async function processPayoutBatchAction(): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  let message: string;
  try {
    const { batchId } = await backendProcessPayoutBatch(apiClient);
    if (!batchId) {
      return {
        status: 'idle',
        message: 'Nothing to batch — no approved requests are waiting.',
      };
    }
    const batch = await backendGetPayoutBatch(apiClient, batchId);
    const toReconcile = batch.requests.filter(
      (request) => request.status === 'RECONCILIATION_REQUIRED',
    ).length;
    message =
      toReconcile > 0
        ? `Batch created. ${toReconcile} ${toReconcile === 1 ? 'request needs' : 'requests need'} reconciling — make each transfer, then resolve it.`
        : 'Batch created.';
  } catch (error) {
    return toFormState(error);
  }
  revalidatePayouts();
  return { status: 'idle', message };
}
