import {
  backendFulfillmentExceptionKinds,
  type BackendAdminOrderCustomer,
  type BackendAdminOrderItem,
  type BackendCancelFulfillmentLinesInput,
  type BackendCreateFulfillmentExceptionInput,
  type BackendFulfillmentExceptionKind,
  type BackendFulfillmentLine,
  type BackendFulfillmentStatus,
  type BackendOrderStatus,
  type BackendResolveFulfillmentExceptionInput,
} from '@commerce/contracts';

import {
  addFieldError,
  optionalText,
  readIndexedRows,
  rowField,
  wholeNumber,
} from './form-rows';

/*
 * The rules the admin order page and its actions share — which controls to
 * offer and how their plain-HTML forms turn back into API input. The API
 * enforces every one of these again; they're here so the page doesn't offer
 * a button that can only fail, and a bad form gets its error on the field.
 */

/**
 * Only an unpaid order can be cancelled outright (the API 409s otherwise) —
 * a paid one is unwound through fulfillment cancellations and refunds.
 */
export function canCancelOrder(status: BackendOrderStatus): boolean {
  return status === 'PENDING_PAYMENT';
}

/** A fulfillment order with nothing left to raise an exception or cancel against. */
export function isFulfillmentClosed(status: BackendFulfillmentStatus): boolean {
  return status === 'DISPATCHED' || status === 'CANCELLED';
}

/**
 * Units on a line that can still be cancelled — mirrors the API's
 * `applyCancellation` check: active (not already cancelled) and not yet
 * dispatched.
 */
export function cancellableQuantity(line: BackendFulfillmentLine): number {
  return Math.max(
    0,
    line.allocatedQuantity - line.cancelledQuantity - line.dispatchedQuantity,
  );
}

/** How a line is named on the page: its listing, then its variant detail. */
export function describeOrderItem(item: BackendAdminOrderItem | undefined): {
  title: string;
  detail: string | null;
} {
  if (!item) return { title: 'Unknown item', detail: null };
  const title =
    item.listingTitle ??
    item.product?.name ??
    `Offer ${item.offerId.slice(0, 8)}`;
  const detail = [item.variant?.name, item.variant?.skuCode ?? item.sellerSku]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
  return { title, detail: detail === '' ? null : detail };
}

/** A customer's display name, falling back to their email. */
export function customerName(customer: BackendAdminOrderCustomer): string {
  const name = [customer.firstName, customer.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  return name === '' ? customer.email : name;
}

type Parsed<T> =
  | { ok: true; input: T }
  | { ok: false; fieldErrors: Record<string, string[]> };

function isExceptionKind(
  value: string,
): value is BackendFulfillmentExceptionKind {
  return (backendFulfillmentExceptionKinds as readonly string[]).includes(
    value,
  );
}

export function parseCreateExceptionForm(
  formData: FormData,
): Parsed<BackendCreateFulfillmentExceptionInput> {
  const errors: Record<string, string[]> = {};
  const fulfillmentLineId = optionalText(formData.get('fulfillmentLineId'));
  const type = optionalText(formData.get('type')) ?? '';
  const quantity = wholeNumber(optionalText(formData.get('quantity')) ?? '', 1);
  const reason = optionalText(formData.get('reason'));

  if (!fulfillmentLineId)
    addFieldError(errors, 'fulfillmentLineId', 'Choose a line.');
  if (!isExceptionKind(type))
    addFieldError(errors, 'type', 'Choose what went wrong.');
  if (Number.isNaN(quantity)) {
    addFieldError(errors, 'quantity', 'Enter a whole number of at least 1.');
  }
  if (!reason) addFieldError(errors, 'reason', 'Say what happened.');

  if (Object.keys(errors).length > 0 || !fulfillmentLineId || !reason) {
    return { ok: false, fieldErrors: errors };
  }
  return {
    ok: true,
    input: {
      fulfillmentLineId,
      type: type as BackendFulfillmentExceptionKind,
      quantity,
      reason,
    },
  };
}

export function parseResolveExceptionForm(
  formData: FormData,
): Parsed<BackendResolveFulfillmentExceptionInput> {
  const errors: Record<string, string[]> = {};
  const action = formData.get('action');
  const resolution = optionalText(formData.get('resolution'));

  if (action !== 'resume' && action !== 'cancel_quantity') {
    addFieldError(errors, 'action', 'Choose how to resolve it.');
  }
  if (!resolution)
    addFieldError(errors, 'resolution', 'Say how it was resolved.');

  if (Object.keys(errors).length > 0 || !resolution) {
    return { ok: false, fieldErrors: errors };
  }
  return {
    ok: true,
    input: { action: action as 'resume' | 'cancel_quantity', resolution },
  };
}

/**
 * Rows are posted as `lines.<i>.fulfillmentLineId` / `lines.<i>.quantity`.
 * A blank or zero quantity leaves that line alone; at least one line has to
 * cancel something.
 */
export function parseCancelLinesForm(
  formData: FormData,
): Parsed<BackendCancelFulfillmentLinesInput> {
  const errors: Record<string, string[]> = {};
  const lines: BackendCancelFulfillmentLinesInput['lines'] = [];

  for (const row of readIndexedRows(formData, 'lines')) {
    const raw = row.fields.quantity ?? '';
    if (raw === '' || raw === '0') continue;
    const quantity = wholeNumber(raw, 1);
    const fulfillmentLineId = row.fields.fulfillmentLineId;
    if (Number.isNaN(quantity)) {
      addFieldError(
        errors,
        rowField('lines', row.index, 'quantity'),
        'Enter a whole number.',
      );
      continue;
    }
    if (fulfillmentLineId) lines.push({ fulfillmentLineId, quantity });
  }

  const reason = optionalText(formData.get('reason'));
  if (!reason)
    addFieldError(errors, 'reason', 'Say why these units are cancelled.');
  if (lines.length === 0 && Object.keys(errors).length === 0) {
    addFieldError(errors, 'lines', 'Enter a quantity on at least one line.');
  }

  if (Object.keys(errors).length > 0 || !reason) {
    return { ok: false, fieldErrors: errors };
  }
  return { ok: true, input: { lines, reason } };
}
