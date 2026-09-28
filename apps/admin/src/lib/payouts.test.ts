import { describe, expect, it } from 'vitest';

import type { BackendPayoutAccount } from '@commerce/contracts';

import {
  buildResolveInput,
  canVerifyPayoutAccount,
  describePayoutEventAction,
  latestAttemptReference,
  payoutRequestActions,
  sortAccountsForReview,
} from './payouts';

function account(
  id: string,
  status: BackendPayoutAccount['status'],
  createdAt: string,
): BackendPayoutAccount {
  return {
    id,
    sellerId: 'seller',
    method: 'MOBILE_MONEY',
    provider: 'Airtel',
    accountHolderName: 'Jane Banda',
    maskedReference: '****4821',
    status,
    verificationNote: null,
    verifiedByUserId: null,
    verifiedAt: null,
    version: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

function attempt(attemptNumber: number, providerReference: string | null) {
  return {
    id: `a${attemptNumber}`,
    attemptNumber,
    provider: 'manual',
    status: 'RECONCILIATION_REQUIRED' as const,
    providerReference,
    failureReason: null,
    startedAt: '2026-09-01T10:00:00.000Z',
    completedAt: null,
  };
}

describe('payoutRequestActions', () => {
  it('mirrors the service status guards', () => {
    expect(payoutRequestActions('REQUESTED')).toEqual(['approve', 'reject']);
    expect(payoutRequestActions('FAILED')).toEqual(['retry']);
    expect(payoutRequestActions('RECONCILIATION_REQUIRED')).toEqual([
      'resolve',
    ]);
  });

  it('offers nothing while in flight or once closed', () => {
    for (const status of [
      'APPROVED',
      'PROCESSING',
      'SUCCEEDED',
      'CANCELLED',
    ] as const) {
      expect(payoutRequestActions(status)).toEqual([]);
    }
  });
});

describe('canVerifyPayoutAccount', () => {
  it('only allows a decision on a pending account', () => {
    expect(canVerifyPayoutAccount('PENDING_VERIFICATION')).toBe(true);
    expect(canVerifyPayoutAccount('VERIFIED')).toBe(false);
    expect(canVerifyPayoutAccount('REJECTED')).toBe(false);
  });
});

describe('sortAccountsForReview', () => {
  it('puts pending accounts first, then newest first', () => {
    const sorted = sortAccountsForReview([
      account('old-verified', 'VERIFIED', '2026-01-01T00:00:00.000Z'),
      account('new-verified', 'VERIFIED', '2026-03-01T00:00:00.000Z'),
      account('pending', 'PENDING_VERIFICATION', '2025-12-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((row) => row.id)).toEqual([
      'pending',
      'new-verified',
      'old-verified',
    ]);
  });
});

describe('latestAttemptReference', () => {
  it('takes the highest-numbered attempt', () => {
    expect(
      latestAttemptReference({
        attempts: [attempt(2, 'manual:a2'), attempt(1, 'manual:a1')],
      }),
    ).toBe('manual:a2');
  });

  it('is null with no attempts', () => {
    expect(latestAttemptReference({ attempts: [] })).toBeNull();
  });
});

describe('buildResolveInput', () => {
  const base = { providerReference: '', note: '', version: 3 };

  it('needs the transfer reference to mark paid', () => {
    const built = buildResolveInput(
      { ...base, outcome: 'SUCCEEDED' },
      'manual:a1',
    );
    expect(built.ok).toBe(false);
    expect(!built.ok && built.fieldErrors.providerReference).toBeTruthy();
  });

  it('marks paid with the typed reference', () => {
    expect(
      buildResolveInput(
        { ...base, outcome: 'SUCCEEDED', providerReference: ' FT2609 ' },
        'manual:a1',
      ),
    ).toEqual({
      ok: true,
      input: {
        outcome: 'SUCCEEDED',
        providerReference: 'FT2609',
        note: undefined,
        version: 3,
      },
    });
  });

  it('needs a reason to mark failed, and falls back to the attempt reference', () => {
    expect(
      buildResolveInput({ ...base, outcome: 'FAILED' }, 'manual:a1').ok,
    ).toBe(false);
    expect(
      buildResolveInput(
        { ...base, outcome: 'FAILED', note: 'Number closed' },
        'manual:a1',
      ),
    ).toEqual({
      ok: true,
      input: {
        outcome: 'FAILED',
        providerReference: 'manual:a1',
        note: 'Number closed',
        version: 3,
      },
    });
  });

  it('rejects an unknown outcome', () => {
    expect(buildResolveInput({ ...base, outcome: 'MAYBE' }, null).ok).toBe(
      false,
    );
  });
});

describe('describePayoutEventAction', () => {
  it('turns an action code into words', () => {
    expect(describePayoutEventAction('RETRY_APPROVED')).toBe('Retry approved');
  });
});
