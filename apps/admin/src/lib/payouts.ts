import type {
  BackendPayoutAccount,
  BackendPayoutAccountStatus,
  BackendPayoutBatchStatus,
  BackendPayoutRequest,
  BackendResolvePayoutRequestInput,
  BackendSellerPayoutStatus,
} from '@commerce/contracts';

/*
 * The payout rail is manual today: the only provider behind it never claims
 * money moved. Processing a batch hands every request to reconciliation with
 * a `manual:` reference, and nothing is paid until an admin makes the
 * transfer by other means and resolves the request against it. The copy
 * here says so, rather than implying a bank integration that isn't there.
 */

export type PayoutRequestAction = 'approve' | 'reject' | 'retry' | 'resolve';

/** Mirrors the status guards in `PayoutsService`. */
export function payoutRequestActions(
  status: BackendSellerPayoutStatus,
): PayoutRequestAction[] {
  switch (status) {
    case 'REQUESTED':
      return ['approve', 'reject'];
    case 'FAILED':
      return ['retry'];
    case 'RECONCILIATION_REQUIRED':
      return ['resolve'];
    default:
      return [];
  }
}

/** What each status means for the person looking at it, and what's next. */
export const PAYOUT_STATUS_HELP: Record<BackendSellerPayoutStatus, string> = {
  REQUESTED:
    'The seller asked to be paid. The amount is held off their available balance until this is approved or rejected.',
  APPROVED:
    'Approved and waiting for the next batch. Nothing has been sent yet.',
  PROCESSING:
    'Claimed by a batch and being handed to the payout provider.',
  RECONCILIATION_REQUIRED:
    'The manual provider never sends money. Make the transfer yourself, then resolve this with the bank or mobile-money reference — or mark it failed to return the amount to the seller.',
  SUCCEEDED: 'Resolved as paid. The seller’s ledger has been debited.',
  FAILED:
    'Resolved as failed. The amount went back to the seller’s available balance; retry to send it through another batch.',
  CANCELLED:
    'Rejected or withdrawn. The amount went back to the seller’s available balance.',
};

export const PAYOUT_ACCOUNT_STATUS_HELP: Record<
  BackendPayoutAccountStatus,
  string
> = {
  PENDING_VERIFICATION:
    'Check the destination against the seller’s documents before verifying — payouts only go to verified accounts.',
  VERIFIED: 'Payout requests can be made against this account.',
  REJECTED: 'The seller has to correct and resubmit it.',
  DISABLED: 'Turned off by the seller.',
};

/** Renders an event's `action` code (`RETRY_APPROVED`) as words. */
export function describePayoutEventAction(action: string): string {
  const words = action.toLowerCase().replace(/[_.]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/*
 * The API counts a request left in RECONCILIATION_REQUIRED as an error when
 * it closes a batch, and the manual provider leaves every request there — so
 * with today's rail a batch always ends "with errors". The help says what
 * that actually means rather than suggesting something broke.
 */
export const PAYOUT_BATCH_STATUS_HELP: Record<BackendPayoutBatchStatus, string> = {
  OPEN: 'Claimed but not yet submitted.',
  PROCESSING: 'Its requests are being handed to the payout provider.',
  COMPLETED: 'Every request in it was resolved by the provider.',
  COMPLETED_WITH_ERRORS:
    'Handed over, with requests left to reconcile or failed. With the manual provider this is the normal outcome: nothing was paid, and each request waits for you to make the transfer and resolve it.',
};

/** Only an account awaiting verification can be verified or rejected. */
export function canVerifyPayoutAccount(
  status: BackendPayoutAccountStatus,
): boolean {
  return status === 'PENDING_VERIFICATION';
}

/**
 * Accounts waiting on a decision first, then newest first — the API's own
 * order — so the review queue is at the top of the list.
 */
export function sortAccountsForReview(
  accounts: readonly BackendPayoutAccount[],
): BackendPayoutAccount[] {
  return [...accounts].sort((left, right) => {
    const leftPending = canVerifyPayoutAccount(left.status) ? 0 : 1;
    const rightPending = canVerifyPayoutAccount(right.status) ? 0 : 1;
    return (
      leftPending - rightPending ||
      right.createdAt.localeCompare(left.createdAt)
    );
  });
}

/** The provider reference the latest attempt was given (`manual:<attempt>`). */
export function latestAttemptReference(
  request: Pick<BackendPayoutRequest, 'attempts'>,
): string | null {
  const latest = [...request.attempts].sort(
    (left, right) => right.attemptNumber - left.attemptNumber,
  )[0];
  return latest?.providerReference ?? null;
}

/**
 * Builds the resolve body from the reconcile form.
 *
 * Marking a payout paid needs the reference of the real transfer — the bank
 * or mobile-money confirmation — because that is what the ledger debit will
 * point to. Marking it failed needs no transfer, so the reference falls back
 * to the attempt's own `manual:` one (the API still requires a string), and
 * the note becomes the failure reason the seller sees.
 */
export function buildResolveInput(
  values: {
    outcome: string;
    providerReference: string;
    note: string;
    version: number;
  },
  fallbackReference: string | null,
):
  | { ok: true; input: BackendResolvePayoutRequestInput }
  | { ok: false; fieldErrors: Record<string, string[]> } {
  const outcome = values.outcome;
  if (outcome !== 'SUCCEEDED' && outcome !== 'FAILED') {
    return { ok: false, fieldErrors: { outcome: ['Choose paid or failed.'] } };
  }
  const reference = values.providerReference.trim();
  const note = values.note.trim();

  if (outcome === 'SUCCEEDED' && reference === '') {
    return {
      ok: false,
      fieldErrors: {
        providerReference: [
          'Enter the reference of the transfer you made, so the ledger can point to it.',
        ],
      },
    };
  }
  if (outcome === 'FAILED' && note === '') {
    return {
      ok: false,
      fieldErrors: { note: ['Say why the transfer failed.'] },
    };
  }

  return {
    ok: true,
    input: {
      outcome,
      providerReference: reference || fallbackReference || 'manual',
      note: note === '' ? undefined : note,
      version: values.version,
    },
  };
}
