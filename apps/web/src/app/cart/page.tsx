import type { Metadata } from 'next';

import { CartContents } from '@/components/cart-contents';

export const metadata: Metadata = {
  title: 'Cart',
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Cart</h1>
      <CartContents />
    </div>
  );
}
