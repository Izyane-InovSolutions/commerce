import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Promotions' };

export default async function PromotionsPage() {
  await requireUser();

  return (
    <AwaitingBackend
      title={'Promotions'}
      description={'Your discounts and campaigns.'}
      needs={['GET /seller/promotions']}
    />
  );
}
