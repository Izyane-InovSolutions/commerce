import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'Best Sellers',
};

export default function BestSellersPage() {
  return (
    <PlaceholderPage
      title="Best Sellers"
      description="Top-selling products across the marketplace, ranked by the catalog module's sales signals."
    />
  );
}
