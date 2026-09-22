import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'Deals',
};

export default function DealsPage() {
  return (
    <PlaceholderPage
      title="Deals"
      description="Nothing to show yet: a price has a start and an end date in the API, but there is no endpoint that returns what is currently discounted, so there is no honest way to list deals."
    />
  );
}
