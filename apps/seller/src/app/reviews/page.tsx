import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Reviews',
};

export default function ReviewsPage() {
  return (
    <SectionPlaceholder
      title="Reviews"
      description="Reviews left for your offers and your storefront."
    />
  );
}
