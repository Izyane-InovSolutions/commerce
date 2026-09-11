import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Sellers' };

export default async function SellersPage() {
  await requireAdmin();

  return (
    <AwaitingBackend
      title={'Sellers'}
      description={'Applications, approval, and suspension.'}
      needs={[
        'GET  /sellers',
        'POST /sellers/:id/suspend',
        'GET  /seller-applications',
        'POST /seller-applications/:id/approve',
      ]}
      note={
        'The database has a SELLER role and a nullable Offer.sellerId, but no seller table and no seller endpoints — the schema notes that sellers arrive in Phase 3.'
      }
    />
  );
}
