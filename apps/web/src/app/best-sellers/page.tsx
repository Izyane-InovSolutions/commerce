import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'Best Sellers',
};

export default function BestSellersPage() {
  return (
    <PlaceholderPage
      title="Best Sellers"
      description="Nothing to show yet: orders record what sold, but the API exposes no ranking over them, so any list here would be invented rather than measured."
    />
  );
}
