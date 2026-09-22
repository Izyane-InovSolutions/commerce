import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Promotions' };

export default async function PromotionsPage() {
  await requireAdmin();

  return (
    <AwaitingBackend
      title={'Promotions'}
      description={'Campaigns, coupons, and collections.'}
      needs={['GET /admin/promotions']}
    />
  );
}
