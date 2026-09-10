import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'Cart',
};

export default function CartPage() {
  return (
    <PlaceholderPage
      title="Cart"
      description="The cart is owned by the cart module. Line totals and availability are validated server-side, never in the browser."
    />
  );
}
