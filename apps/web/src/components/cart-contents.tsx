'use client';

import Link from 'next/link';
import { PackageSearch, Trash } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getCartTotal, resolveCartLines } from '@/lib/cart';
import { useCart } from '@/lib/cart-context';
import { formatCurrency } from '@/lib/currency';

export function CartContents() {
  const { items, removeItem } = useCart();

  const lines = resolveCartLines(items);
  const total = getCartTotal(lines);

  if (lines.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">Your cart is empty</p>
        <p className="text-muted-foreground text-sm">
          Add products from the catalog to see them here.
        </p>
        <Button asChild size="sm">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <ul className="space-y-4">
        {lines.map((line) => (
          <li key={line.slug}>
            <Card>
              <CardContent className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <PackageSearch
                    className="size-6 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium">{line.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {formatCurrency(line.unitPrice)} × {line.quantity}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-sm font-semibold">
                    {formatCurrency(line.lineTotal)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem(line.slug)}
                  >
                    <Trash data-icon="inline-start" />
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

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
          <Button asChild className="w-full">
            <Link href="/checkout">Proceed to Checkout</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
