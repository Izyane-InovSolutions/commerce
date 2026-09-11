import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Promotions',
};

export default function PromotionsPage() {
  return (
    <SectionPlaceholder
      title="Promotions"
      description="Campaigns, coupons, and curated collections."
    />
  );
}
