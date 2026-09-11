'use client';

import { useState } from 'react';
import Link from 'next/link';

import { CHECKOUT_FORM_ID, CheckoutForm } from '@/components/checkout-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getCartTotal, resolveCartLines } from '@/lib/cart';
import { useCart } from '@/lib/cart-context';
import { formatCurrency } from '@/lib/currency';

export function CheckoutContent() {
  const { items } = useCart();
  const [placed, setPlaced] = useState(false);

  const lines = resolveCartLines(items);
  const total = getCartTotal(lines);

  if (lines.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">Your cart is empty</p>
        <p className="text-muted-foreground text-sm">
          Add products to your cart before checking out.
        </p>
        <Button asChild size="sm">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  if (placed) {
    return (
      <div className="space-y-2 rounded-2xl border border-dashed p-8 text-center">
        <p className="text-lg font-semibold">Order placed</p>
        <p className="text-muted-foreground text-sm">
          This is a demo checkout, so no payment was actually charged. Real
          payments arrive with Phase 1.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <CheckoutForm onPlaced={() => setPlaced(true)} />

      <Card className="h-fit">
        <CardContent className="space-y-4">
          <h2 className="text-base font-semibold">Order summary</h2>
          <ul className="space-y-3">
            {lines.map((line) => (
              <li
                key={line.slug}
                className="flex justify-between gap-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {line.name} × {line.quantity}
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
          <Button type="submit" form={CHECKOUT_FORM_ID} className="w-full">
            Pay {formatCurrency(total)}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
