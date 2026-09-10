import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Fulfillment',
};

export default function FulfillmentPage() {
  return (
    <SectionPlaceholder
      title="Fulfillment"
      description="Pick, pack, ship, and tracking updates for the orders you fulfill."
    />
  );
}
