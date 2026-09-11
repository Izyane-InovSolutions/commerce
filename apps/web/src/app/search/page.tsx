import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'Search',
};

export default async function SearchPage({
  searchParams,
}: PageProps<'/search'>) {
  const { q } = await searchParams;
  const query = typeof q === 'string' ? q.trim() : '';

  return (
    <PlaceholderPage
      title={query.length > 0 ? `Results for “${query}”` : 'Search'}
      description="Catalog search arrives with Phase 1. It will query the catalog module through GET /api/v1/products."
    />
  );
}
