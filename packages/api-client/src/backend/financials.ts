import type {
  BackendAdminPayoutAccount,
  BackendItemsPage,
  BackendLedgerEntry,
  BackendPayout,
  BackendPayoutAccount,
  BackendPayoutBatch,
  BackendPayoutBatchDetail,
  BackendPayoutRequest,
  BackendPayoutRequestQuery,
  BackendProcessPayoutBatchResult,
  BackendRecordPayoutInput,
  BackendResolvePayoutRequestInput,
  BackendReviewPayoutRequestInput,
  BackendSellerBalance,
  BackendSellerBalanceIntegrity,
  BackendVerifyPayoutAccountInput,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * Money owed and money paid.
 *
 * A seller reads their own balance and ledger; an administrator reads any
 * seller's and records payouts against it. Both sides speak the same two
 * shapes, so the pairs differ only in path and in who may call them.
 *
 * A payout is bookkeeping — it records that a seller was paid by some
 * external means and debits the ledger accordingly. Nothing here moves money.
 */

export type BackendLedgerQuery = { page?: number; limit?: number };

export function backendGetSellerBalanceIntegrity(
  client: ApiClient,
  sellerId: string,
): Promise<BackendSellerBalanceIntegrity> {
  return client.get(`/admin/sellers/${sellerId}/balance/integrity`, {
    cache: 'no-store',
  });
}

export function backendGetOwnBalance(
  client: ApiClient,
): Promise<BackendSellerBalance> {
  return client.get('/sellers/me/balance', { cache: 'no-store' });
}

export function backendListOwnLedger(
  client: ApiClient,
  query: BackendLedgerQuery = {},
): Promise<BackendItemsPage<BackendLedgerEntry>> {
  return client.get('/sellers/me/ledger', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetSellerBalance(
  client: ApiClient,
  sellerId: string,
): Promise<BackendSellerBalance> {
  return client.get(`/admin/sellers/${sellerId}/balance`, {
    cache: 'no-store',
  });
}

export function backendListSellerLedger(
  client: ApiClient,
  sellerId: string,
  query: BackendLedgerQuery = {},
): Promise<BackendItemsPage<BackendLedgerEntry>> {
  return client.get(`/admin/sellers/${sellerId}/ledger`, {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

/**
 * Records a payout against a seller.
 *
 * Idempotency-keyed because a retried payout would debit the ledger twice;
 * the caller reuses one key across retries of the same logical payout.
 */
export function backendRecordPayout(
  client: ApiClient,
  sellerId: string,
  input: BackendRecordPayoutInput,
  idempotencyKey?: string,
): Promise<BackendPayout> {
  return client.post(`/admin/sellers/${sellerId}/payouts`, {
    body: input,
    idempotencyKey,
  });
}

/** Every payout, across all sellers, newest first. */
export function backendListPayouts(
  client: ApiClient,
  query: BackendLedgerQuery = {},
): Promise<BackendItemsPage<BackendPayout>> {
  return client.get('/admin/payouts', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

/**
 * The explicit name for the same manual reconciliation path as
 * `backendRecordPayout` — "this seller was paid outside the payout rail".
 * The idempotency key is required here, not optional.
 */
export function backendRecordExternalPayout(
  client: ApiClient,
  sellerId: string,
  input: BackendRecordPayoutInput,
  idempotencyKey: string,
): Promise<BackendPayout> {
  return client.post(`/admin/sellers/${sellerId}/payouts/external`, {
    body: input,
    idempotencyKey,
  });
}

/* ---- the payout rail: accounts, requests, and batches (ADMIN-only) ---- */

/**
 * Every payout account, or one seller's. The list never includes the
 * destination itself — only `maskedReference`.
 */
export function backendListPayoutAccounts(
  client: ApiClient,
  query: { sellerId?: string } = {},
): Promise<BackendPayoutAccount[]> {
  return client.get('/admin/payout-accounts', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

/** Reveals the full destination. The API audits every call. */
export function backendGetPayoutAccount(
  client: ApiClient,
  id: string,
): Promise<BackendAdminPayoutAccount> {
  return client.get(`/admin/payout-accounts/${id}`, { cache: 'no-store' });
}

export function backendVerifyPayoutAccount(
  client: ApiClient,
  id: string,
  input: BackendVerifyPayoutAccountInput,
): Promise<BackendPayoutAccount> {
  return client.post(`/admin/payout-accounts/${id}/verify`, { body: input });
}

export function backendListPayoutRequests(
  client: ApiClient,
  query: BackendPayoutRequestQuery = {},
): Promise<BackendItemsPage<BackendPayoutRequest>> {
  return client.get('/admin/payout-requests', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetPayoutRequest(
  client: ApiClient,
  id: string,
): Promise<BackendPayoutRequest> {
  return client.get(`/admin/payout-requests/${id}`, { cache: 'no-store' });
}

/** The review steps that take a version and an optional reason. */
export type BackendPayoutRequestReview = 'approve' | 'reject' | 'retry';

/**
 * Approve (`REQUESTED` → `APPROVED`), reject (`REQUESTED` → `CANCELLED`,
 * reason required), or retry (`FAILED` → `APPROVED`). Each needs a UUID v4
 * idempotency key, reused across retries of the same decision.
 */
export function backendReviewPayoutRequest(
  client: ApiClient,
  id: string,
  review: BackendPayoutRequestReview,
  input: BackendReviewPayoutRequestInput,
  idempotencyKey: string,
): Promise<BackendPayoutRequest> {
  return client.post(`/admin/payout-requests/${id}/${review}`, {
    body: input,
    idempotencyKey,
  });
}

/** Closes a `RECONCILIATION_REQUIRED` request as paid or failed. */
export function backendResolvePayoutRequest(
  client: ApiClient,
  id: string,
  input: BackendResolvePayoutRequestInput,
  idempotencyKey: string,
): Promise<BackendPayoutRequest> {
  return client.post(`/admin/payout-requests/${id}/resolve`, {
    body: input,
    idempotencyKey,
  });
}

/**
 * Claims every `APPROVED`, unbatched request into a new batch and submits
 * each to the payout provider, synchronously. `batchId` is null when there
 * was nothing to claim.
 */
export function backendProcessPayoutBatch(
  client: ApiClient,
): Promise<BackendProcessPayoutBatchResult> {
  return client.post('/admin/payout-batches/process');
}

export function backendListPayoutBatches(
  client: ApiClient,
  query: { page?: number; limit?: number } = {},
): Promise<BackendItemsPage<BackendPayoutBatch>> {
  return client.get('/admin/payout-batches', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetPayoutBatch(
  client: ApiClient,
  id: string,
): Promise<BackendPayoutBatchDetail> {
  return client.get(`/admin/payout-batches/${id}`, { cache: 'no-store' });
}
