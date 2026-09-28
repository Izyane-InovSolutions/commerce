'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  ApiError,
  backendCreateGoodsReceipt,
  backendCreatePurchaseOrder,
  backendDeleteGoodsReceipt,
  backendGetPurchaseOrder,
  backendPostGoodsReceipt,
  backendReverseGoodsReceipt,
  backendRevisePurchaseOrder,
  backendTransitionPurchaseOrder,
  backendTransitionPurchaseOrderWithReason,
  backendUpdatePurchaseOrder,
  type BackendPurchaseOrderReasonTransition,
  type BackendPurchaseOrderVersionTransition,
} from '@commerce/api-client';
import type { BackendPurchaseOrder } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import { readIndexedRows } from '@/lib/form-rows';
import {
  parsePurchaseOrderHeader,
  parsePurchaseOrderLines,
  parseReceiptLines,
  type PurchaseOrderAction,
} from '@/lib/procurement';
import { getCurrentUser, guardAction } from '@/lib/session';

/*
 * Purchase-order routes are `@Roles(STAFF, ADMIN)` in the API except approve,
 * reject, and receipt reversal, which are ADMIN-only — those three pass
 * `adminOnly` to the guard, everything else lets staff through.
 */

function revalidatePurchaseOrder(id?: string): void {
  revalidatePath('/procurement');
  if (id) {
    revalidatePath(`/procurement/purchase-orders/${id}`);
  }
}

/** Fields the purchase-order form has an input for. */
const HEADER_FIELDS = new Set([
  'supplierId',
  'warehouseId',
  'currency',
  'expectedDeliveryDate',
  'notes',
]);

/**
 * The API reports line errors against the array it received
 * (`lines.0.unitCostAmount`), which is compacted and in minor-unit field
 * names, so it can't be pinned to the row that caused it. Anything without
 * an input of its own is folded into the form-level message instead of being
 * dropped.
 */
function explainApiError(error: unknown): FormState {
  const state = toFormState(error);
  const unplaced = Object.entries(state.fieldErrors ?? {}).filter(
    ([field]) => !HEADER_FIELDS.has(field),
  );
  if (unplaced.length === 0) return state;

  const detail = unplaced
    .map(([field, messages]) => `${field}: ${messages.join(' ')}`)
    .join('; ');
  return {
    ...state,
    message: state.message ? `${state.message} (${detail})` : detail,
  };
}

/** Header and lines together, or the errors to show against them. */
function readPurchaseOrderForm(formData: FormData) {
  const { header, fieldErrors: headerErrors } =
    parsePurchaseOrderHeader(formData);
  const {
    lines,
    fieldErrors: lineErrors,
    formError,
  } = parsePurchaseOrderLines(readIndexedRows(formData, 'lines'));
  const fieldErrors = { ...headerErrors, ...lineErrors };

  if (Object.keys(fieldErrors).length > 0 || formError) {
    return {
      error: {
        status: 'error',
        message: formError ?? 'Check the form and try again.',
        fieldErrors,
      } satisfies FormState,
    };
  }
  return { header, lines };
}

export async function createPurchaseOrderAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  const parsed = readPurchaseOrderForm(formData);
  if (parsed.error) {
    return parsed.error;
  }

  const { header, lines } = parsed;
  let purchaseOrderId: string;
  try {
    const po = await backendCreatePurchaseOrder(apiClient, {
      supplierId: header.supplierId,
      warehouseId: header.warehouseId,
      currency: header.currency,
      shippingAmount: header.shippingAmount,
      expectedDeliveryDate: header.expectedDeliveryDate,
      notes: header.notes || undefined,
      lines,
    });
    purchaseOrderId = po.id;
  } catch (error) {
    return explainApiError(error);
  }

  revalidatePurchaseOrder();
  redirect(`/procurement/purchase-orders/${purchaseOrderId}`);
}

/**
 * Saves a draft, replacing every line. The supplier and warehouse only go
 * out when they changed: the API re-checks that whichever it is sent is
 * still active, so resending an unchanged supplier that has since been
 * deactivated would block every other edit to the draft.
 */
export async function updatePurchaseOrderAction(
  po: Pick<BackendPurchaseOrder, 'id' | 'version' | 'supplierId' | 'warehouseId'>,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  const parsed = readPurchaseOrderForm(formData);
  if (parsed.error) {
    return parsed.error;
  }

  const { header, lines } = parsed;
  try {
    await backendUpdatePurchaseOrder(apiClient, po.id, {
      version: po.version,
      supplierId:
        header.supplierId === po.supplierId ? undefined : header.supplierId,
      warehouseId:
        header.warehouseId === po.warehouseId ? undefined : header.warehouseId,
      currency: header.currency,
      shippingAmount: header.shippingAmount,
      expectedDeliveryDate: header.expectedDeliveryDate,
      notes: header.notes,
      lines,
    });
  } catch (error) {
    return explainApiError(error);
  }

  revalidatePurchaseOrder(po.id);
  redirect(`/procurement/purchase-orders/${po.id}`);
}

const VERSION_TRANSITIONS: Partial<
  Record<PurchaseOrderAction, BackendPurchaseOrderVersionTransition>
> = {
  submit: 'submit',
  approve: 'approve',
  place: 'place',
};

const REASON_TRANSITIONS: Partial<
  Record<PurchaseOrderAction, BackendPurchaseOrderReasonTransition>
> = {
  returnToDraft: 'return-to-draft',
  reject: 'reject',
  cancel: 'cancel',
  closeShort: 'close-short',
};

const CONFIRMATIONS: Partial<Record<PurchaseOrderAction, string>> = {
  submit: 'Submitted for approval.',
  approve: 'Approved.',
  place: 'Marked as ordered.',
  returnToDraft: 'Returned to draft.',
  reject: 'Rejected.',
  cancel: 'Cancelled.',
  closeShort: 'Closed short.',
};

/**
 * Every status change on a purchase order. Which one arrives as the pressed
 * button's value, and the version is the one the page rendered, so two
 * people acting on the same order cannot both win — the API refuses the
 * second with a conflict.
 */
export async function transitionPurchaseOrderAction(
  po: Pick<BackendPurchaseOrder, 'id' | 'version'>,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const transition = String(formData.get('transition') ?? '') as PurchaseOrderAction;
  const versionOnly = VERSION_TRANSITIONS[transition];
  const withReason = REASON_TRANSITIONS[transition];
  if (!versionOnly && !withReason) {
    return { status: 'error', message: 'Choose an action.' };
  }

  const denied = await guardAction(
    transition === 'approve' || transition === 'reject',
  );
  if (denied) {
    return denied;
  }

  const reason = String(formData.get('reason') ?? '').trim();
  if (withReason && reason === '') {
    return {
      status: 'error',
      message: 'Give a reason.',
      fieldErrors: { reason: ['A reason is required.'] },
    };
  }

  try {
    if (versionOnly) {
      await backendTransitionPurchaseOrder(apiClient, po.id, versionOnly, {
        version: po.version,
      });
    } else if (withReason) {
      await backendTransitionPurchaseOrderWithReason(
        apiClient,
        po.id,
        withReason,
        { version: po.version, reason },
      );
    }
  } catch (error) {
    return toFormState(error);
  }

  revalidatePurchaseOrder(po.id);
  return { status: 'idle', message: CONFIRMATIONS[transition] };
}

/**
 * Copies an approved or ordered purchase order into a new draft and opens
 * it. The original is untouched until someone cancels it.
 */
export async function revisePurchaseOrderAction(
  purchaseOrderId: string,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  let revisionId: string;
  try {
    revisionId = (await backendRevisePurchaseOrder(apiClient, purchaseOrderId))
      .id;
  } catch (error) {
    return toFormState(error);
  }

  revalidatePurchaseOrder(purchaseOrderId);
  redirect(`/procurement/purchase-orders/${revisionId}`);
}

/**
 * Records a delivery and posts it into stock in one call.
 *
 * The purchase order is read again here rather than trusted from the page,
 * so what counts as outstanding is what the API will check against, and the
 * warehouse is always the order's own — the API refuses any other.
 *
 * The idempotency key is minted by the receive page per render. A timeout
 * retried with it replays safely. A definite refusal is different: the API
 * may already have saved a draft under that key before posting failed, and
 * a retry would re-post that draft instead of the corrected quantities — so
 * the page is revalidated, which mints a fresh key and lists the stray draft
 * on the order for someone to post or discard.
 */
export async function createGoodsReceiptAction(
  purchaseOrderId: string,
  idempotencyKey: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  let po;
  try {
    po = await backendGetPurchaseOrder(apiClient, purchaseOrderId);
  } catch (error) {
    return toFormState(error);
  }

  const user = await getCurrentUser();
  const { lines, fieldErrors, formError } = parseReceiptLines(
    readIndexedRows(formData, 'receipt'),
    po.lines,
    { canAuthorizeExcess: user?.role === 'ADMIN' },
  );
  if (Object.keys(fieldErrors).length > 0 || formError) {
    return {
      status: 'error',
      message: formError ?? 'Check the quantities and try again.',
      fieldErrors,
    };
  }

  const deliveryNote = String(formData.get('supplierDeliveryNoteRef') ?? '').trim();

  try {
    await backendCreateGoodsReceipt(
      apiClient,
      purchaseOrderId,
      {
        warehouseId: po.warehouseId,
        supplierDeliveryNoteRef: deliveryNote || undefined,
        post: true,
        lines,
      },
      idempotencyKey,
    );
  } catch (error) {
    if (error instanceof ApiError) {
      revalidatePath(`/procurement/purchase-orders/${purchaseOrderId}/receive`);
      revalidatePurchaseOrder(purchaseOrderId);
    }
    return toFormState(error);
  }

  revalidatePurchaseOrder(purchaseOrderId);
  redirect(`/procurement/purchase-orders/${purchaseOrderId}`);
}

/** Posts a receipt that was saved as a draft. */
export async function postGoodsReceiptAction(
  purchaseOrderId: string,
  receiptId: string,
  idempotencyKey: string,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendPostGoodsReceipt(apiClient, receiptId, idempotencyKey);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePurchaseOrder(purchaseOrderId);
  return { status: 'idle', message: 'Receipt posted.' };
}

/** Abandons a draft receipt. Nothing reached stock, so nothing is undone. */
export async function discardGoodsReceiptAction(
  purchaseOrderId: string,
  receiptId: string,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendDeleteGoodsReceipt(apiClient, receiptId);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePurchaseOrder(purchaseOrderId);
  return { status: 'idle', message: 'Draft receipt discarded.' };
}

/**
 * Reverses a posted receipt: the API posts a mirror-image receipt that takes
 * the accepted stock back out and reopens the quantities on the order.
 */
export async function reverseGoodsReceiptAction(
  purchaseOrderId: string,
  receiptId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const reason = String(formData.get('reason') ?? '').trim();
  if (reason === '') {
    return {
      status: 'error',
      message: 'Give a reason.',
      fieldErrors: { reason: ['A reason is required.'] },
    };
  }

  try {
    await backendReverseGoodsReceipt(apiClient, receiptId, { reason });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePurchaseOrder(purchaseOrderId);
  return { status: 'idle', message: 'Receipt reversed.' };
}
