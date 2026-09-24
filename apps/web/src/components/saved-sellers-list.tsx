import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { FormState } from '@/lib/form';
import type { SavedSellerView } from '@/lib/commerce-types';
import { UnsaveSellerButton } from '@/components/unsave-seller-button';

/** The account page's Saved sellers tab. */
export function SavedSellersList({
  sellers,
  remove,
}: {
  sellers: SavedSellerView[];
  remove: (sellerId: string) => Promise<FormState>;
}) {
  if (sellers.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">No saved sellers yet</p>
        <p className="text-muted-foreground text-sm">
          Save a seller from their storefront page and they will wait here.
        </p>
        <Button asChild size="sm">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {sellers.map((seller) => (
        <li key={seller.id}>
          <Card>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                {seller.isAvailable && seller.storefrontSlug ? (
                  <Link
                    href={`/sellers/${seller.storefrontSlug}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {seller.displayName ?? 'Seller'}
                  </Link>
                ) : (
                  <p className="text-sm font-medium">
                    {seller.displayName ?? 'Seller'}
                  </p>
                )}
                <p className="text-muted-foreground text-sm">
                  {seller.isAvailable
                    ? seller.averageRating !== null
                      ? `${seller.averageRating.toFixed(1)} ★ (${seller.ratingCount} ${
                          seller.ratingCount === 1 ? 'rating' : 'ratings'
                        })`
                      : 'No ratings yet'
                    : 'No longer available'}
                </p>
              </div>
              <UnsaveSellerButton remove={remove.bind(null, seller.sellerId)} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
