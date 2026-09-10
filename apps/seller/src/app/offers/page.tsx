import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Offers',
};

export default function OffersPage() {
  return (
    <SectionPlaceholder
      title="Offers"
      description="Your offers against catalog products, with pricing and commercial conditions. Prices are authoritative on the server."
    />
  );
}
