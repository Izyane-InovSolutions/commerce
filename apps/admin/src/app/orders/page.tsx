import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Orders',
};

export default function OrdersPage() {
  return (
    <SectionPlaceholder
      title="Orders"
      description="Customer orders, the seller orders beneath them, and their fulfillment groups."
    />
  );
}
