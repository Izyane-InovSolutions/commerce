import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Finance' };

export default async function FinancePage() {
  await requireAdmin();

  return (
    <AwaitingBackend
      title={'Finance'}
      description={'Ledger, commissions, balances, and payouts.'}
      needs={['GET /admin/ledger', 'GET /admin/payouts']}
    />
  );
}
