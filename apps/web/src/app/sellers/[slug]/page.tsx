import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { BackButton } from '@/components/back-button';
import { StorefrontOfferCard } from '@/components/storefront-offer-card';
import { getStorefront, listStorefrontOffers } from '@/lib/catalog';
import type { StorefrontOffer } from '@/lib/catalog-types';

type SellerPageProps = PageProps<'/sellers/[slug]'>;

const OFFER_LIMIT = 48;

export async function generateMetadata({
  params,
}: SellerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const storefront = await getStorefront(slug);
  return { title: storefront?.displayName ?? 'Seller' };
}

function RatingSummary({
  averageRating,
  ratingCount,
}: {
  averageRating: number | null;
  ratingCount: number;
}) {
  if (averageRating === null) {
    return <p className="text-muted-foreground text-sm">No ratings yet.</p>;
  }

  return (
    <p className="text-muted-foreground text-sm">
      {averageRating.toFixed(1)} {'★'} ({ratingCount}{' '}
      {ratingCount === 1 ? 'rating' : 'ratings'})
    </p>
  );
}

export default async function SellerStorefrontPage({
  params,
}: SellerPageProps) {
  const { slug } = await params;
  const storefront = await getStorefront(slug);

  if (!storefront) {
    notFound();
  }

  let offers: StorefrontOffer[];
  let total = 0;
  let failure: unknown = null;

  try {
    ({ items: offers, total } = await listStorefrontOffers(slug, {
      limit: OFFER_LIMIT,
    }));
  } catch (error) {
    offers = [];
    failure = error;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <BackButton />

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {storefront.displayName ?? 'Seller'}
        </h1>
        <RatingSummary
          averageRating={storefront.averageRating}
          ratingCount={storefront.ratingCount}
        />
        {storefront.description ? (
          <p className="text-muted-foreground max-w-2xl text-pretty">
            {storefront.description}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {failure ? 'Products' : `${total} ${total === 1 ? 'product' : 'products'}`}
        </h2>

        {failure ? (
          <ApiErrorNotice error={failure} />
        ) : offers.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing published yet — check back soon.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {offers.map((offer) => (
              <StorefrontOfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
