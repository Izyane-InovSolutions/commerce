import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage() {
  await requireUser();

  return (
    <AwaitingBackend
      title={'Payments'}
      description={'Your balance, commission, and payouts.'}
      needs={['GET /seller/balance', 'GET /seller/payouts']}
      note={
        'Payment initialisation currently returns 503 — the provider is a stub awaiting the in-house gateway.'
      }
    />
  );
}
