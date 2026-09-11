import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Orders' };

export default async function OrdersPage() {
  await requireUser();

  return (
    <AwaitingBackend
      title={'Orders'}
      description={'Orders placed against your offers.'}
      needs={['GET /seller/orders', 'GET /seller/orders/:id']}
      note={
        'GET /orders exists but returns the signed-in user’s own purchases, not orders to fulfil.'
      }
    />
  );
}
