import Link from 'next/link';

import { OfferAddToCart } from '@/components/offer-add-to-cart';
import type { OtherOffer } from '@/lib/catalog-types';
import { formatMinor } from '@/lib/currency';
import type { FormState } from '@/lib/form';

/** Who a row is sold by — the platform's own offers carry no seller. */
export function offerSellerName(offer: Pick<OtherOffer, 'seller' | 'isFirstParty'>) {
  if (offer.seller?.displayName) return offer.seller.displayName;
  return offer.isFirstParty ? 'iZyane Marketplace' : 'A marketplace seller';
}

function formatCondition(condition: NonNullable<OtherOffer['condition']>) {
  return condition.charAt(0) + condition.slice(1).toLowerCase();
}

/**
 * Everyone else selling the selected variant, each with their own price,
 * shipping and stock, and an "Add to cart" for that specific offer — the
 * cart is keyed by offer, so this is how a shopper picks a seller other than
 * the one in the buy box.
 */
export function OtherSellers({
  offers,
  addToCart,
}: {
  offers: OtherOffer[];
  addToCart: (
    offerId: string,
    state: FormState,
    formData: FormData,
  ) => Promise<FormState>;
}) {
  if (offers.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" aria-labelledby="other-sellers-heading">
      <h2
        id="other-sellers-heading"
        className="text-lg font-semibold tracking-tight"
      >
        Other sellers ({offers.length})
      </h2>
      <ul className="divide-y rounded-2xl border">
        {offers.map((offer) => {
          const name = offerSellerName(offer);
          return (
            <li
              key={offer.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold">
                  {formatMinor(offer.price.amount, offer.price.currency)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {offer.shippingCost === null
                    ? 'Shipping calculated at checkout'
                    : offer.shippingCost.amount === 0
                      ? 'Free shipping'
                      : `+ ${formatMinor(offer.shippingCost.amount, offer.shippingCost.currency)} shipping`}
                  {offer.condition ? ` · ${formatCondition(offer.condition)}` : ''}
                </p>
                <p className="text-xs">
                  Sold by{' '}
                  {offer.seller?.storefrontSlug ? (
                    <Link
                      href={`/sellers/${offer.seller.storefrontSlug}`}
                      className="font-medium hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="font-medium">{name}</span>
                  )}
                </p>
                {offer.listingTitle ? (
                  <p className="text-muted-foreground line-clamp-1 text-xs">
                    {offer.listingTitle}
                  </p>
                ) : null}
              </div>

              {offer.inStock ? (
                <OfferAddToCart
                  sellerName={name}
                  addToCart={addToCart.bind(null, offer.id)}
                />
              ) : (
                <span className="text-destructive text-xs font-medium">
                  Out of stock
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
