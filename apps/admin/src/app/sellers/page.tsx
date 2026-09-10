import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Sellers',
};

export default function SellersPage() {
  return (
    <SectionPlaceholder
      title="Sellers"
      description="Seller applications, verification, approval, and suspension."
    />
  );
}
