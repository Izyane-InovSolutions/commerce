import Link from 'next/link';

import { ProductImage } from '@/components/product-image';
import { Card, CardContent } from '@/components/ui/card';
import {
  getDisplayPrice,
  getPrimaryImage,
  type Product,
} from '@/lib/catalog-types';
import { formatCurrency } from '@/lib/currency';

export function ProductCard({ product }: { product: Product }) {
  const price = getDisplayPrice(product);

  return (
    <Link href={`/products/${product.slug}`} className="group block h-full">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardContent className="space-y-3">
          <ProductImage
            src={getPrimaryImage(product)?.url ?? null}
            alt={product.name}
            sizes="(min-width: 1024px) 25vw, 50vw"
            className="aspect-square rounded-lg"
          />
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
