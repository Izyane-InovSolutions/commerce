import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Orders' };

export default async function OrdersPage() {
  await requireAdmin();

  return (
    <AwaitingBackend
      title={'Orders'}
      description={'Customer orders and their payment state.'}
      needs={[
        'GET /orders  — exists, but returns only the caller’s own orders',
        'GET /admin/orders  — not implemented',
      ]}
      note={
        'The customer-facing order list works; an administrator cannot yet see everyone’s orders.'
      }
    />
  );
}
