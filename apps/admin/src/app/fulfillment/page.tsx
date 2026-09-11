import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Fulfillment',
};

export default function FulfillmentPage() {
  return (
    <SectionPlaceholder
      title="Fulfillment"
      description="Shipments, carrier handoffs, 3PL integrations, and pickup."
    />
  );
}
