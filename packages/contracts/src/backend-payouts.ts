/* ---- seller payouts: accounts, requests, attempts, and batches ---- */

/**
 * Shapes as `admin/payout-*` returns and accepts them. Every amount is minor
 * units.
 *
 * The rail behind these is manual: the only provider wired today never
 * claims money moved, so processing a request always lands it in
 * `RECONCILIATION_REQUIRED` with a `manual:<attempt>` reference, and an admin
 * then resolves it once the transfer has — or has not — happened elsewhere.
 */

export const backendPayoutAccountMethods = ['BANK', 'MOBILE_MONEY'] as const;
export type BackendPayoutAccountMethod =
  (typeof backendPayoutAccountMethods)[number];

export const backendPayoutAccountStatuses = [
  'PENDING_VERIFICATION',
  'VERIFIED',
  'REJECTED',
  'DISABLED',
] as const;
export type BackendPayoutAccountStatus =
  (typeof backendPayoutAccountStatuses)[number];

/** The list projection — the destination itself is never included. */
export type BackendPayoutAccount = {
  id: string;
  sellerId: string;
  method: BackendPayoutAccountMethod;
  provider: string;
  accountHolderName: string;
  maskedReference: string;
  status: BackendPayoutAccountStatus;
  verificationNote: string | null;
  verifiedByUserId: string | null;
  verifiedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * The single-account read, which does carry the destination. The API records
 * an audit event every time it is fetched.
 */
export type BackendAdminPayoutAccount = BackendPayoutAccount & {
  destination: Record<string, unknown>;
};

/** Only a `PENDING_VERIFICATION` account can be verified or rejected. */
export type BackendVerifyPayoutAccountInput = {
  status: 'VERIFIED' | 'REJECTED';
  note: string;
  version: number;
};

export const backendSellerPayoutStatuses = [
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'RECONCILIATION_REQUIRED',
] as const;
export type BackendSellerPayoutStatus =
  (typeof backendSellerPayoutStatuses)[number];

export type BackendPayoutAttempt = {
  id: string;
  attemptNumber: number;
  provider: string;
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'RECONCILIATION_REQUIRED';
  providerReference: string | null;
  failureReason: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type BackendPayoutRequestEvent = {
  id: string;
  action: string;
  fromStatus: BackendSellerPayoutStatus | null;
  toStatus: BackendSellerPayoutStatus;
  actorUserId: string | null;
  metadata: unknown;
  createdAt: string;
};

export type BackendPayoutRequest = {
  id: string;
  sellerId: string;
  payoutAccountId: string;
  amount: number;
  currency: string;
  status: BackendSellerPayoutStatus;
  idempotencyKey: string;
  failureReason: string | null;
  cancellationReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  batchId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  payoutAccount: BackendPayoutAccount;
  attempts: BackendPayoutAttempt[];
  events: BackendPayoutRequestEvent[];
};

export type BackendPayoutRequestQuery = {
  page?: number;
  limit?: number;
  status?: BackendSellerPayoutStatus;
  sellerId?: string;
};

/** Approve, reject, and retry. A rejection must carry a reason. */
export type BackendReviewPayoutRequestInput = {
  version: number;
  reason?: string;
};

/**
 * Closes a `RECONCILIATION_REQUIRED` request: `SUCCEEDED` debits the seller's
 * ledger as paid, `FAILED` returns the amount to their available balance.
 */
export type BackendResolvePayoutRequestInput = {
  outcome: 'SUCCEEDED' | 'FAILED';
  providerReference: string;
  note?: string;
  version: number;
};

export const backendPayoutBatchStatuses = [
  'OPEN',
  'PROCESSING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
] as const;
export type BackendPayoutBatchStatus =
  (typeof backendPayoutBatchStatuses)[number];

export type BackendPayoutBatch = {
  id: string;
  status: BackendPayoutBatchStatus;
  requestCount: number;
  totalAmount: number;
  currency: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BackendPayoutBatchDetail = BackendPayoutBatch & {
  requests: BackendPayoutRequest[];
};

/** `null` when nothing was `APPROVED` and unbatched to claim. */
export type BackendProcessPayoutBatchResult = { batchId: string | null };
