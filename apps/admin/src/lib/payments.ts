import { ApiError } from '@commerce/api-client';
import {
  backendRefundPaymentSchema,
  type BackendGatewayPaymentQuery,
  type BackendRefund,
} from '@commerce/contracts';

import { toFormState, type FormState } from './form';
import { formatMinor, toMinor } from './money';
import { readParam, type RawSearchParams } from './search-params';

/*
 * Two money conventions meet on the payments page. The gateway's payment list
 * is the gateway's own record, in *major* units; every refund the platform
 * takes or returns is in minor units, like the rest of the API. Anything
 * shown goes through `formatMinor`, so gateway amounts are converted to minor
 * units first rather than getting a formatter of their own.
 */

export const GATEWAY_PAGE_SIZE = 25;

/**
 * The portal pages from 1, like every other list here; the gateway pages
 * from 0. The URL carries the portal's page and the query carries the
 * gateway's.
 */
export function readGatewayPaymentQuery(
  params: RawSearchParams,
): BackendGatewayPaymentQuery & { page: number; size: number } {
  const requested = Number(readParam(params, 'page') ?? '1');
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  return {
    page: page - 1,
    size: GATEWAY_PAGE_SIZE,
    sortBy: 'createdAt',
    descending: 'true',
  };
}

/** A gateway amount (major units) as the portal shows money. */
export function formatGatewayAmount(amount: number, currency: string): string {
  return formatMinor(Math.round(amount * 100), currency);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every id these routes take is a UUID; anything else would earn a 400. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export type ParsedRefundForm =
  | { ok: true; targetId: string; amount: number; reason: string }
  | { ok: false; fieldErrors: Record<string, string[]> };

/**
 * Reads a refund off its form: which payment or seller order, how much, and
 * why. The amount is typed in major units — how a refund is read off a
 * receipt — and sent in minor units; the limits and messages are the
 * contract's own, so the portal refuses what the API would refuse.
 */
export function parseRefundForm(formData: FormData): ParsedRefundForm {
  const targetId = String(formData.get('targetId') ?? '').trim();
  const rawAmount = String(formData.get('amount') ?? '').trim();

  const fieldErrors: Record<string, string[]> = {};
  if (!isUuid(targetId)) {
    fieldErrors.targetId = ['Paste the id exactly as the order page shows it.'];
  }
  if (!/^\d+(\.\d{1,2})?$/.test(rawAmount.replace(/,/g, ''))) {
    fieldErrors.amount = ['Enter an amount such as 12.50.'];
  }

  const parsed = backendRefundPaymentSchema.safeParse({
    amount: toMinor(rawAmount),
    reason: String(formData.get('reason') ?? ''),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      if (fieldErrors[field]) continue;
      fieldErrors[field] = [issue.message];
    }
  }

  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, targetId, ...parsed.data };
}

/**
 * Form state for a refused refund.
 *
 * A 501 is not a validation problem the admin can fix: it is the API saying
 * the gateway cannot refund yet. The API's own wording is kept — it says what
 * to do instead where there is something — but it is framed so nobody retries
 * in the hope it was transient.
 */
export function refundErrorState(error: unknown): FormState {
  const state = toFormState(error);
  if (error instanceof ApiError && error.status === 501) {
    return {
      ...state,
      message: `Not supported yet — ${state.message ?? 'the payment gateway cannot take refunds.'}`,
    };
  }
  return state;
}

/**
 * What one provider refund attempt came back as, in a sentence. A refund the
 * provider has not settled yet is said to be in flight, since reconciling is
 * the next thing to do with it.
 */
export function describeRefund(refund: BackendRefund): string {
  const amount = formatMinor(refund.amount, refund.currency);
  const id = `Refund attempt ${refund.id}`;
  switch (refund.status) {
    case 'SUCCEEDED':
      return `${id}: ${amount} refunded.`;
    case 'FAILED':
      return `${id}: ${amount} failed${refund.failureReason ? ` — ${refund.failureReason}` : ''}.`;
    case 'CANCELLED':
      return `${id}: ${amount} cancelled.`;
    default:
      return `${id}: ${amount} is ${refund.status.toLowerCase()} with the provider. Reconcile it to fetch the outcome.`;
  }
}

/**
 * What is left to refund on a seller order. The API refuses more than this;
 * it is shown next to the form so nobody has to find that out by trying.
 */
export function refundableAmount(sellerOrder: {
  total: number;
  refundedAmount: number;
}): number {
  return Math.max(0, sellerOrder.total - sellerOrder.refundedAmount);
}
