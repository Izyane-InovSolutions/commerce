import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Inventory' };

export default async function InventoryPage() {
  await requireUser();

  return (
    <AwaitingBackend
      title={'Inventory'}
      description={'The stock you hold.'}
      needs={['GET  /seller/inventory', 'POST /seller/inventory/adjustments']}
      note={
        'Stock exists in the API, but every record belongs to a platform warehouse; there is no seller-held stock.'
      }
    />
  );
}
