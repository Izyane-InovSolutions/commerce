import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'All Products',
};

export default function ProductsPage() {
  return (
    <PlaceholderPage
      title="All Products"
      description="Browse the full catalog. Arrives with Phase 1, backed by the catalog module through GET /api/v1/products."
    />
  );
}
