import type { Metadata } from 'next';

import { CheckoutContent } from '@/components/checkout-content';

export const metadata: Metadata = {
  title: 'Checkout',
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <p className="text-muted-foreground mt-1 text-sm text-pretty">
        Server-authoritative pricing and payments arrive with Phase 1, backed by
        the cart and checkout modules. This page is a demo of the flow.
      </p>

      <div className="mt-8">
        <CheckoutContent />
      </div>
    </div>
  );
}
