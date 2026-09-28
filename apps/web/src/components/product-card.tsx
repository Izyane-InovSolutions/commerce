import Link from 'next/link';

import { ProductImage } from '@/components/product-image';
import { Card, CardContent } from '@/components/ui/card';
import {
  getDisplayPrice,
  getDisplaySale,
  getPrimaryImage,
  getPrimaryOffer,
  getShippingCost,
  isInStock,
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
  const sale = getDisplaySale(product);
  const shippingCost = getShippingCost(product);
  // A caller's own badge (a shelf's "New", say) wins over the saving.
  const label = badge ?? (sale ? `Save ${sale.percentOff}%` : undefined);
  const outOfStock = price !== null && !isInStock(product);
  // Null for the platform's own products — only a marketplace offer names a
  // seller at all.
  const seller = getPrimaryOffer(product)?.seller ?? null;

  return (
    <Card className="group relative h-full transition-all duration-200 hover:shadow-md hover:border-foreground/20">
      <CardContent className="space-y-3">
        <Link href={`/products/${product.slug}`} className="block">
          <div className="relative overflow-hidden rounded-lg">
            <ProductImage
              src={getPrimaryImage(product)?.url ?? null}
              alt={product.name}
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="aspect-square rounded-lg transition-transform duration-300 group-hover:scale-105"
            />
            {outOfStock ? (
              <span className="absolute top-2.5 left-2.5 inline-flex items-center rounded-full bg-destructive/90 px-2.5 py-0.5 text-xs font-medium text-white shadow-sm backdrop-blur-xs">
                Out of stock
              </span>
            ) : label ? (
              <span
                className={
                  sale && !badge
                    ? 'absolute top-2.5 left-2.5 inline-flex items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm'
                    : 'absolute top-2.5 left-2.5 inline-flex items-center rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-xs'
                }
              >
                {label}
              </span>
            ) : null}
          </div>
        </Link>
        <div className="space-y-1">
          {product.category ? (
            <p className="text-xs font-medium text-muted-foreground">
              {product.category.name}
            </p>
          ) : null}
          <Link href={`/products/${product.slug}`}>
            <p className="text-sm font-medium line-clamp-2 hover:underline">
              {product.name}
            </p>
          </Link>
          {seller?.storefrontSlug ? (
            <Link
              href={`/sellers/${seller.storefrontSlug}`}
              className="text-muted-foreground block text-xs hover:underline"
            >
              Sold by {seller.displayName ?? 'a marketplace seller'}
            </Link>
          ) : seller ? (
            <p className="text-muted-foreground text-xs">
              Sold by {seller.displayName ?? 'a marketplace seller'}
            </p>
          ) : null}
          <Link href={`/products/${product.slug}`}>
            <p className="text-sm font-semibold">
              {price !== null
                ? formatMinor(price.amount, price.currency)
                : 'Not sold in this currency'}
              {sale ? (
                <span className="text-muted-foreground ml-1.5 text-xs font-normal line-through">
                  <span className="sr-only">was </span>
                  {formatMinor(sale.was.amount, sale.was.currency)}
                </span>
              ) : null}
            </p>
          </Link>
          {price !== null && shippingCost !== null ? (
            <p className="text-xs text-muted-foreground">
              {shippingCost.amount === 0
                ? 'Free shipping'
                : `+ ${formatMinor(shippingCost.amount, shippingCost.currency)} shipping`}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
