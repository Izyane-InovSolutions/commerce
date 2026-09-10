import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Catalog',
};

export default function CatalogPage() {
  return (
    <SectionPlaceholder
      title="Catalog"
      description="Products, variants, categories, brands, and media. Products are owned by the platform, never by a seller."
    />
  );
}
