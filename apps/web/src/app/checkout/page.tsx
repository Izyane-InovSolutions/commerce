import type { Metadata } from 'next';

import { CheckoutForm } from '@/components/checkout-form';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/currency';
import { getMockCartLines, getMockCartTotal } from '@/lib/mock-data/cart';

export const metadata: Metadata = {
  title: 'Checkout',
};

export default function CheckoutPage() {
  const lines = getMockCartLines();
  const total = getMockCartTotal(lines);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <p className="text-muted-foreground mt-1 text-sm text-pretty">
        Server-authoritative pricing and payments arrive with Phase 1, backed by
        the cart and checkout modules. This page is a demo of the flow.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <CheckoutForm total={total} />

        <Card className="h-fit">
          <CardContent className="space-y-4">
            <h2 className="text-base font-semibold">Order summary</h2>
            <ul className="space-y-3">
              {lines.map((line) => (
                <li
                  key={line.product.id}
                  className="flex justify-between gap-3 text-sm"
                >
                  <span className="text-muted-foreground">
                    {line.product.name} × {line.quantity}
                  </span>
                  <span className="font-medium">
                    {formatCurrency(line.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <Separator />
            <div className="flex justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
