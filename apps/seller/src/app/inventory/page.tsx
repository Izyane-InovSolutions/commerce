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
      needs={[
        'GET  /sellers/me/inventory',
        'POST /sellers/me/inventory/adjustments',
      ]}
      note={
        'An offer can already declare that you hold the stock and ship it yourself, but every inventory record still belongs to a platform warehouse and no endpoint is scoped to a seller, so there is nothing here to count.'
      }
    />
  );
}
