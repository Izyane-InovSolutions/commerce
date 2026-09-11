'use client';

import { useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/cart-context';

export function ProductDetailActions({
  slug,
  name,
  unitPrice,
}: {
  slug: string;
  name: string;
  /** Null when the product has no sellable offer right now. */
  unitPrice: number | null;
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={unitPrice === null}
          onClick={() => {
            if (unitPrice === null) {
              return;
            }
            addItem({ slug, name, unitPrice });
            setAdded(true);
          }}
        >
          {unitPrice === null
            ? 'Currently unavailable'
            : added
              ? 'Added to cart'
              : 'Add to Cart'}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/checkout">Checkout</Link>
        </Button>
      </div>
      {added ? (
        <p className="text-sm text-muted-foreground" role="status">
          {name} added to your cart.
        </p>
      ) : null}
    </div>
  );
}
