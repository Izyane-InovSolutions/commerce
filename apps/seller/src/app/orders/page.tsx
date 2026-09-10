import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Orders',
};

export default function OrdersPage() {
  return (
    <SectionPlaceholder
      title="Orders"
      description="Orders placed against your offers, as seller orders beneath the customer order."
    />
  );
}
