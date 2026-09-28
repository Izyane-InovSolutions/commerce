'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError } from '@commerce/api-client';

import { toFormState, type FormState } from '@/lib/form';
import { cancelOrder, cancelPayment } from '@/lib/orders';
import {
  cancelReturn,
  getReturnEligibility,
  requestReturn,
} from '@/lib/returns';
import {
  validateReturnRequest,
  type ReturnEligibility,
  type ReturnLineDraft,
} from '@/lib/return-types';

function revalidateOrder(orderId: string): void {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/confirmation`);
  revalidatePath('/account');
}

/**
 * Cancels an order still awaiting payment. A 409 carries the API's own
 * reason (typically: it has been paid since the page loaded), which is shown
 * as it is; a 404 from an API that does not offer cancellation yet reads as
 * such rather than as "order not found".
 */
export async function cancelOrderAction(orderId: string): Promise<FormState> {
  try {
    await cancelOrder(orderId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return {
        status: 'error',
        message: 'This order can’t be cancelled online right now.',
      };
    }
    return toFormState(error);
  }

  revalidateOrder(orderId);
  return { status: 'idle', message: 'Order cancelled.' };
}

/** Stops a payment that is still waiting on the shopper or the gateway. */
export async function cancelPaymentAction(
  orderId: string,
  paymentId: string,
): Promise<FormState> {
  try {
    await cancelPayment(paymentId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateOrder(orderId);
  return { status: 'idle', message: 'Payment cancelled.' };
}

/**
 * Asks for a return of some of an order's lines.
 *
 * The form posts one set of fields per line (`selected.<id>`,
 * `quantity.<id>`, `reasonCode.<id>`, `note.<id>`), which is checked here
 * against current eligibility first, for a clear message, and again by the
 * API under a lock.
 */
export async function requestReturnAction(
  orderId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  // Re-read here rather than trusted from the page: bound action arguments
  // round-trip through the browser.
  let eligibility: ReturnEligibility[];
  try {
    eligibility = await getReturnEligibility(orderId);
  } catch (error) {
    return toFormState(error);
  }

  const drafts: ReturnLineDraft[] = eligibility.map((line) => {
    const id = line.orderItemId;
    return {
      orderItemId: id,
      selected: formData.get(`selected.${id}`) === 'on',
      quantity: String(formData.get(`quantity.${id}`) ?? ''),
      reasonCode: String(formData.get(`reasonCode.${id}`) ?? ''),
      note: String(formData.get(`note.${id}`) ?? ''),
    };
  });

  const validation = validateReturnRequest(drafts, eligibility);
  if (!validation.ok) {
    return {
      status: 'error',
      message: validation.message,
      fieldErrors: validation.fieldErrors,
    };
  }

  let returnId: string;
  try {
    const created = await requestReturn(
      orderId,
      validation.input,
      String(formData.get('idempotencyKey') ?? ''),
    );
    returnId = created.id;
  } catch (error) {
    return toFormState(error);
  }

  revalidateOrder(orderId);
  revalidatePath('/returns');
  redirect(`/returns/${returnId}?requested=1`);
}

export async function cancelReturnAction(
  returnId: string,
  version: number,
): Promise<FormState> {
  try {
    await cancelReturn(returnId, version);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/returns');
  revalidatePath(`/returns/${returnId}`);
  return { status: 'idle', message: 'Return cancelled.' };
}
