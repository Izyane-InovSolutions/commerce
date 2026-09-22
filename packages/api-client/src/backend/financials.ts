import type {
  BackendItemsPage,
  BackendLedgerEntry,
  BackendPayout,
  BackendRecordPayoutInput,
  BackendSellerBalance,
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
