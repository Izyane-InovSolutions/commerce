'use client';

import { useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export function ProductDetailActions({ productName }: { productName: string }) {
  const [added, setAdded] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setAdded(true)}>
          {added ? 'Added to cart' : 'Add to Cart'}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/checkout">Checkout</Link>
        </Button>
      </div>
      {added ? (
        <p className="text-sm text-muted-foreground" role="status">
          {productName} added to your cart.
        </p>
      ) : null}
    </div>
  );
}
