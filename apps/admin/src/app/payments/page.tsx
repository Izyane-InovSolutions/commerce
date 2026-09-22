import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage() {
  await requireAdmin();

  return (
    <AwaitingBackend
      title={'Payments'}
      description={'Payments, refunds, and reconciliation.'}
      needs={[
        'POST /payments/webhook  — exists, rejects unsigned calls',
        'GET  /admin/payments  — not implemented',
      ]}
      note={
        'Payment initialisation returns 503: the provider is a deliberate stub awaiting the in-house gateway, so checkout cannot complete.'
      }
    />
  );
}
