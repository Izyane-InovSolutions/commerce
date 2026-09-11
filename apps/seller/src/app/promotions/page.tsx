import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';
import { requireSeller } from '@/lib/session';

export const metadata: Metadata = { title: 'Promotions' };

export default async function PromotionsPage() {
  await requireSeller();

  return (
    <SectionPlaceholder
      title="Promotions"
      description="Your own discounts and campaigns, on top of any the platform runs."
    />
  );
}
