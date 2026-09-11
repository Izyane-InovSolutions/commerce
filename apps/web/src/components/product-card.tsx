import Link from 'next/link';
import { PackageSearch } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { getDisplayPrice, type Product } from '@/lib/catalog-types';
import { formatCurrency } from '@/lib/currency';

export function ProductCard({ product }: { product: Product }) {
  const price = getDisplayPrice(product);

  return (
    <Link href={`/products/${product.slug}`} className="group block h-full">
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
            <p className="text-sm font-semibold">
              {price !== null ? formatCurrency(price) : 'Currently unavailable'}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
