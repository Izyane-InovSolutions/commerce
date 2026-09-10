import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'My Orders',
};

export default function OrdersPage() {
  return (
    <PlaceholderPage
      title="My Orders"
      description="Order history, tracking, and returns, backed by the orders module."
    />
  );
}
