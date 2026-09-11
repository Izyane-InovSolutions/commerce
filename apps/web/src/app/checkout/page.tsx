import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'Checkout',
};

export default function CheckoutPage() {
  return (
    <PlaceholderPage
      title="Checkout"
      description="Server-authoritative pricing, totals snapshotted at checkout, and in-house payments arrive with Phase 1, backed by the cart and checkout modules."
    />
  );
}
