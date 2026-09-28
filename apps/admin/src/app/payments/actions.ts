'use server';

import { revalidatePath } from 'next/cache';

import {
  backendReconcileRefund,
  backendRefundPayment,
  backendRefundSellerOrder,
} from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import type { FormState } from '@/lib/form';
import {
  describeRefund,
  parseRefundForm,
  refundErrorState,
} from '@/lib/payments';
import { guardAction } from '@/lib/session';

/*
 * Every route here is `@Roles(Role.ADMIN)`, hence `guardAction(true)`.
 *
 * The two refund actions take an `idempotencyKey` bound by the payments page,
 * which mints one per render (the API insists on a UUID v4). A double-click
 * or a retry after a timeout replays the same key, so the API returns the
 * first refund instead of opening a second; a successful refund revalidates
 * the page, which re-renders it with a fresh key for the next one.
 */

/**
 * Refunds part or all of one seller's slice of an order.
 *
 * This is the refund the platform actually books: it opens an ADMIN refund
 * case, keeping payment, order and seller ledger in step, and hands the first
 * attempt to the payment provider. Whether money moves depends on the
 * gateway supporting refunds — when it does not, the attempt comes back
 * failed, or the API refuses outright, and the message says so.
 */
export async function refundSellerOrderAction(
  idempotencyKey: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const input = parseRefundForm(formData);
  if (!input.ok) {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: input.fieldErrors,
    };
  }

  let message: string;
  try {
    const refund = await backendRefundSellerOrder(
      apiClient,
      input.targetId,
      { amount: input.amount, reason: input.reason },
      idempotencyKey,
    );
    message = describeRefund(refund);
  } catch (error) {
    return refundErrorState(error);
  }

  revalidatePath('/payments');
  revalidatePath('/orders');
  return { status: 'idle', message };
}

/**
 * Refunds a whole payment by its platform id.
 *
 * The route exists, but the API checks the payment and then refuses with 501,
 * pointing to the seller-order refund — a payment-level refund would move
 * money without the order and ledger records that account for it. The
 * control stays so that refusal is visible here rather than implied.
 */
export async function refundPaymentAction(
  idempotencyKey: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const input = parseRefundForm(formData);
  if (!input.ok) {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: input.fieldErrors,
    };
  }

  let message: string;
  try {
    const snapshot = await backendRefundPayment(
      apiClient,
      input.targetId,
      { amount: input.amount, reason: input.reason },
      idempotencyKey,
    );
    message = `Refund requested. The payment is now ${snapshot.localStatus.toLowerCase()}.`;
  } catch (error) {
    return refundErrorState(error);
  }

  revalidatePath('/payments');
  return { status: 'idle', message };
}

/**
 * Asks the provider again about a refund attempt still in flight and applies
 * the answer to its refund case. A settled attempt comes back unchanged.
 */
export async function reconcileRefundAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const refundId = String(formData.get('refundId') ?? '').trim();
  if (refundId === '') {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: { refundId: ['Paste the refund attempt id.'] },
    };
  }

  let message: string;
  try {
    message = describeRefund(await backendReconcileRefund(apiClient, refundId));
  } catch (error) {
    return refundErrorState(error);
  }

  revalidatePath('/payments');
  return { status: 'idle', message };
}
