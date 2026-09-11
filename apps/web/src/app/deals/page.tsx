import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'Deals',
};

export default function DealsPage() {
  return (
    <PlaceholderPage
      title="Deals"
      description="Active discounts and promotions across the marketplace, sourced from the offers and pricing modules."
    />
  );
}
