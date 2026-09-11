import Link from 'next/link';
import { PackageSearch } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import type { Product } from '@/lib/mock-data/products';

export function ProductCard({ product }: { product: Product }) {
  const onSale = typeof product.compareAtPrice === 'number';

  return (
    <Link href={`/products/${product.id}`} className="group block h-full">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardContent className="space-y-3">
          <div className="flex aspect-square items-center justify-center rounded-lg bg-muted">
            <PackageSearch
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium group-hover:underline">
              {product.name}
            </p>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-semibold">
                {formatCurrency(product.price)}
              </span>
              {onSale ? (
                <span className="text-muted-foreground line-through">
                  {formatCurrency(product.compareAtPrice as number)}
                </span>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
