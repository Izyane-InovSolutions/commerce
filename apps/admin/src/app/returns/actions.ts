'use server';

import { revalidatePath } from 'next/cache';

import {
  backendApproveReturn,
  backendFinalizeReturnInspection,
  backendGetReturn,
  backendPostReturnInspection,
  backendPostReturnReceipt,
  backendRejectReturn,
  backendRetryReturnRefund,
} from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import {
  formField,
  parseInspectionLines,
  parseReceiptLines,
  parseShippingRefunds,
  receiptCompletesReturn,
  returnItemProgress,
} from '@/lib/returns';
import { guardAction } from '@/lib/session';

/*
 * Approve, reject, finalize and refund retry are ADMIN-only on the API
 * (`@Roles(Role.ADMIN)` on those routes); receipts and inspections are open
 * to staff, who the API additionally limits to returns assigned to them.
 *
 * Receipts and inspections are idempotency-keyed. The detail page mints a
 * key per render and the form posts it back, so a double submit or a retry
 * after a timeout replays one receipt rather than recording two; the
 * revalidate after a success re-renders the form with a fresh key.
 */

function revalidateReturn(id: string): void {
  revalidatePath('/returns');
  revalidatePath(`/returns/${id}`);
}

function readKey(formData: FormData): string {
  return String(formData.get('idempotencyKey') ?? '').trim();
}

export async function approveReturnAction(
  id: string,
  version: number,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const warehouseId = String(formData.get('warehouseId') ?? '').trim();
  if (warehouseId === '') {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: {
        warehouseId: ['Choose the warehouse that will receive the items.'],
      },
    };
  }

  try {
    await backendApproveReturn(apiClient, id, { warehouseId, version });
  } catch (error) {
    return toFormState(error);
  }
  revalidateReturn(id);
  return { status: 'idle', message: 'Return approved.' };
}

export async function rejectReturnAction(
  id: string,
  version: number,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const rejectionReason = String(formData.get('rejectionReason') ?? '').trim();
  if (rejectionReason === '') {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: {
        rejectionReason: ['Say why — the customer sees this reason.'],
      },
    };
  }

  try {
    await backendRejectReturn(apiClient, id, { rejectionReason, version });
  } catch (error) {
    return toFormState(error);
  }
  revalidateReturn(id);
  return { status: 'idle', message: 'Return rejected.' };
}

/**
 * Posts what arrived at the warehouse. The item ids come from a fresh read
 * rather than the form, so a tampered field can only name items this return
 * actually has.
 */
export async function postReceiptAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    const request = await backendGetReturn(apiClient, id);
    if (!request.warehouseId) {
      return {
        status: 'error',
        message: 'This return has no receiving warehouse yet.',
      };
    }
    const parsed = parseReceiptLines(
      request.items.map((item) => item.id),
      formField(formData),
    );
    if (!parsed.ok) {
      return {
        status: 'error',
        message: 'Check the quantities and try again.',
        fieldErrors: parsed.fieldErrors,
      };
    }
    // Sent as the closing receipt when it completes the return, ticked or
    // not — otherwise the return could never leave RECEIVING.
    const completes = receiptCompletesReturn(
      returnItemProgress(request),
      parsed.lines,
    );
    await backendPostReturnReceipt(
      apiClient,
      id,
      {
        warehouseId: request.warehouseId,
        lines: parsed.lines,
        isClosing: completes || formData.get('isClosing') === 'on',
      },
      readKey(formData),
    );
  } catch (error) {
    return toFormState(error);
  }
  revalidateReturn(id);
  return { status: 'idle', message: 'Receipt recorded.' };
}

/**
 * Records one inspection pass. Deliberately never `isFinal`: finalizing
 * raises the refund cases and is ADMIN-only, so it stays its own step below
 * rather than a checkbox a staff member could tick here.
 */
export async function postInspectionAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    const request = await backendGetReturn(apiClient, id);
    if (!request.warehouseId) {
      return {
        status: 'error',
        message: 'This return has no receiving warehouse yet.',
      };
    }
    const parsed = parseInspectionLines(
      request.items.map((item) => item.id),
      request.warehouseId,
      formField(formData),
    );
    if (!parsed.ok) {
      return {
        status: 'error',
        message: 'Check the inspection and try again.',
        fieldErrors: parsed.fieldErrors,
      };
    }
    await backendPostReturnInspection(
      apiClient,
      id,
      { lines: parsed.lines },
      readKey(formData),
    );
  } catch (error) {
    return toFormState(error);
  }
  revalidateReturn(id);
  return { status: 'idle', message: 'Inspection recorded.' };
}

/**
 * Closes inspection and fans the accepted units out into one refund case per
 * seller order — or closes the return with no refund if nothing was
 * accepted. Shipping is refunded only where an amount is entered.
 */
export async function finalizeInspectionAction(
  id: string,
  sellerOrderIds: string[],
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const shipping = parseShippingRefunds(sellerOrderIds, formField(formData));
  if (!shipping.ok) {
    return {
      status: 'error',
      message: 'Check the shipping refunds and try again.',
      fieldErrors: shipping.fieldErrors,
    };
  }

  let message = 'Inspection finalized.';
  try {
    const request = await backendFinalizeReturnInspection(
      apiClient,
      id,
      shipping.lines,
    );
    if (request.status === 'REFUND_FAILED') {
      message =
        'Inspection finalized, but the gateway refused the refund. See the refund cases below.';
    } else if (request.status === 'CLOSED_NO_REFUND') {
      message =
        'Inspection finalized. Nothing was accepted, so nothing is refunded.';
    }
    // A request already past INSPECTING comes back unchanged rather than
    // re-finalized; the re-render shows where it actually stands.
  } catch (error) {
    return toFormState(error);
  }
  revalidateReturn(id);
  return { status: 'idle', message };
}

export async function retryRefundCaseAction(
  id: string,
  refundCaseId: string,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  let message = 'Refund retried.';
  try {
    const refundCase = await backendRetryReturnRefund(
      apiClient,
      id,
      refundCaseId,
    );
    if (refundCase.status === 'FAILED') {
      message = 'Retried, and the gateway refused it again.';
    }
  } catch (error) {
    return toFormState(error);
  }
  revalidateReturn(id);
  return { status: 'idle', message };
}
