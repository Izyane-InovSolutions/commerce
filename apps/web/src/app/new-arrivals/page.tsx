import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'New Arrivals',
};

export default function NewArrivalsPage() {
  return (
    <PlaceholderPage
      title="New Arrivals"
      description="Recently listed products, ordered by listing date. Backed by the catalog module."
    />
  );
}
