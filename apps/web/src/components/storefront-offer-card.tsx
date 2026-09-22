import Link from 'next/link';

import { ProductImage } from '@/components/product-image';
import { Card, CardContent } from '@/components/ui/card';
import { formatMinor } from '@/lib/currency';
import type { StorefrontOffer } from '@/lib/catalog-types';

/**
 * One listing on a seller's storefront page — their own price and
 * condition for a product, not the product's own display card: two sellers
 * of the same product would show two of these, side by side, each linking
 * to the one shared product page.
 */
export function StorefrontOfferCard({ offer }: { offer: StorefrontOffer }) {
  return (
    <Link href={`/products/${offer.product.slug}`} className="group block h-full">
      <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-foreground/20">
        <CardContent className="space-y-3">
          <ProductImage
            src={offer.product.image?.url ?? null}
            alt={offer.product.name}
            sizes="(min-width: 1024px) 25vw, 50vw"
            className="aspect-square rounded-lg transition-transform duration-300 group-hover:scale-105"
          />
          <div className="space-y-1">
            <p className="text-sm font-medium line-clamp-2 group-hover:underline">
              {offer.listingTitle ?? offer.product.name}
            </p>
            <p className="text-muted-foreground text-xs">
              {offer.condition.charAt(0) + offer.condition.slice(1).toLowerCase()}
            </p>
            <p className="text-sm font-semibold">
              {offer.currentPrice
                ? formatMinor(offer.currentPrice.amount, offer.currentPrice.currency)
                : 'Not sold in this currency'}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
