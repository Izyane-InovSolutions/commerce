import Link from 'next/link';

import { ProductImage } from '@/components/product-image';
import { Card, CardContent } from '@/components/ui/card';
import {
  getDisplayPrice,
  getPrimaryImage,
  type Product,
} from '@/lib/catalog-types';
import { formatMinor } from '@/lib/currency';

export function ProductCard({
  product,
  badge,
}: {
  product: Product;
  badge?: string;
}) {
  const price = getDisplayPrice(product);

  return (
    <Link href={`/products/${product.slug}`} className="group block h-full">
      <Card className="relative h-full transition-all duration-200 hover:shadow-md hover:border-foreground/20">
        <CardContent className="space-y-3">
          <div className="relative overflow-hidden rounded-lg">
            <ProductImage
              src={getPrimaryImage(product)?.url ?? null}
              alt={product.name}
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="aspect-square rounded-lg transition-transform duration-300 group-hover:scale-105"
            />
            {badge ? (
              <span className="absolute top-2.5 left-2.5 inline-flex items-center rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-xs">
                {badge}
              </span>
            ) : null}
          </div>
          <div className="space-y-1">
            {product.category ? (
              <p className="text-xs font-medium text-muted-foreground">
                {product.category.name}
              </p>
            ) : null}
            <p className="text-sm font-medium line-clamp-2 group-hover:underline">
              {product.name}
            </p>
            <p className="text-sm font-semibold">
              {price !== null
                ? formatMinor(price.amount, price.currency)
                : 'Not sold in this currency'}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
