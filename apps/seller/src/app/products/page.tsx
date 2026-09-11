import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage() {
  await requireUser();

  return (
    <AwaitingBackend
      title={'Products'}
      description={'What you sell, with your price and your stock.'}
      needs={[
        'GET  /seller/catalog',
        'POST /seller/products',
        'PATCH /seller/products/:id',
      ]}
      note={
        'The Commerce API has no seller domain: Offer.sellerId exists but is nullable and unset, and no endpoint is scoped to a seller. The schema notes sellers arrive in Phase 3.'
      }
    />
  );
}
