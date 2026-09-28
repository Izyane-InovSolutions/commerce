'use server';

import { revalidatePath } from 'next/cache';

import {
  backendCancelAdminOrder,
  backendCancelFulfillmentLines,
  backendCreateFulfillmentException,
  backendResolveFulfillmentException,
} from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import {
  parseCancelLinesForm,
  parseCreateExceptionForm,
  parseResolveExceptionForm,
} from '@/lib/order-operations';
import { guardAction } from '@/lib/session';

/*
 * Order cancellation and fulfillment exceptions — the corrective actions on
 * the admin order page, kept apart from the pick/pack/ship steps in
 * `actions.ts`. Each `adminOnly` below matches the route's `@Roles`:
 * cancelling an order and raising an exception are open to STAFF, resolving
 * an exception and cancelling fulfillment lines are ADMIN-only.
 */

function revalidateOrder(orderId: string): void {
  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
}

/** `PENDING_PAYMENT` only — the API 409s on anything later. No body, no reason. */
export async function cancelOrderAction(orderId: string): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }
  try {
    await backendCancelAdminOrder(apiClient, orderId);
  } catch (error) {
    return toFormState(error);
  }
  revalidateOrder(orderId);
  return { status: 'idle', message: 'Order cancelled.' };
}

/** Puts the whole fulfillment order `ON_HOLD` until the exception is resolved. */
export async function createFulfillmentExceptionAction(
  orderId: string,
  fulfillmentOrderId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  const parsed = parseCreateExceptionForm(formData);
  if (!parsed.ok) {
    return { status: 'error', fieldErrors: parsed.fieldErrors };
  }

  try {
    await backendCreateFulfillmentException(
      apiClient,
      fulfillmentOrderId,
      parsed.input,
    );
  } catch (error) {
    return toFormState(error);
  }
  revalidateOrder(orderId);
  return {
    status: 'idle',
    message: 'Exception raised; the shipment is on hold.',
  };
}

/**
 * `resume` releases the hold as-is; `cancel_quantity` also cancels the
 * exception's quantity off its line, returning that stock. Which one is the
 * submit button that was pressed.
 */
export async function resolveFulfillmentExceptionAction(
  orderId: string,
  fulfillmentOrderId: string,
  exceptionId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const parsed = parseResolveExceptionForm(formData);
  if (!parsed.ok) {
    return { status: 'error', fieldErrors: parsed.fieldErrors };
  }

  try {
    await backendResolveFulfillmentException(
      apiClient,
      fulfillmentOrderId,
      exceptionId,
      parsed.input,
    );
  } catch (error) {
    return toFormState(error);
  }
  revalidateOrder(orderId);
  return { status: 'idle', message: 'Exception resolved.' };
}

/**
 * Cancels units off lines and returns them to stock; the API records the
 * refund owed. `idempotencyKey` is bound per render, like the warehouse
 * steps, so a double submit cancels once.
 */
export async function cancelFulfillmentLinesAction(
  orderId: string,
  fulfillmentOrderId: string,
  idempotencyKey: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const parsed = parseCancelLinesForm(formData);
  if (!parsed.ok) {
    return { status: 'error', fieldErrors: parsed.fieldErrors };
  }

  try {
    await backendCancelFulfillmentLines(
      apiClient,
      fulfillmentOrderId,
      parsed.input,
      idempotencyKey,
    );
  } catch (error) {
    return toFormState(error);
  }
  revalidateOrder(orderId);
  return { status: 'idle', message: 'Units cancelled and returned to stock.' };
}
