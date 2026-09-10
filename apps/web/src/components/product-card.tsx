import { PackageSearch } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import type { Product } from '@/lib/mock-data/products';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function ProductCard({ product }: { product: Product }) {
  const onSale = typeof product.compareAtPrice === 'number';

  return (
    <Card className="h-full">
      <CardContent className="space-y-3">
        <div className="flex aspect-square items-center justify-center rounded-lg bg-muted">
          <PackageSearch
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{product.name}</p>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-semibold">
              {currency.format(product.price)}
            </span>
            {onSale ? (
              <span className="text-muted-foreground line-through">
                {currency.format(product.compareAtPrice as number)}
              </span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
