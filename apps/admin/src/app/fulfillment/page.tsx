import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Fulfillment' };

export default async function FulfillmentPage() {
  await requireAdmin();

  return (
    <AwaitingBackend
      title={'Fulfillment'}
      description={'Shipments, carriers, and 3PL handoffs.'}
      needs={['GET /admin/fulfillments', 'GET /admin/shipments']}
    />
  );
}
