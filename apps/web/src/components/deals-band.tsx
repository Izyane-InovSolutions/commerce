import Link from 'next/link';

import { ProductImage } from '@/components/product-image';
import {
  describeLeadRivals,
  getBestDeal,
  getPrimaryImage,
  getProductHref,
  getVariantLabel,
  type Deal as ProductDeal,
  type Product,
} from '@/lib/catalog-types';
import { formatMinor } from '@/lib/currency';
import { cn } from '@/lib/utils';

/** "Sun 5 Oct", in the shop's own time zone. */
function endsOn(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lusaka',
  }).format(new Date(iso));
}

type Deal = { product: Product; deal: ProductDeal; option: string };

/** Each product's best live deal, with the variant it's on. */
export function toDeals(products: Product[]): Deal[] {
  const deals: Deal[] = [];
  for (const product of products) {
    const deal = getBestDeal(product);
    if (!deal) continue;
    deals.push({
      product,
      deal,
      option: product.variants.length > 1 ? getVariantLabel(deal.variant) : '',
    });
  }
  return deals;
}

/**
 * The homepage's one loud moment: real deals only, of two kinds (see
 * `Deal` in catalog-types). A price cut shows its regular price struck
 * through and when it ends; a best price says how far under the next
 * seller it is, with nothing struck through — that other price was never
 * this offer's. With no deal running the band doesn't render at all.
 */
export function DealsBand({
  products,
  limit = 8,
  standalone = false,
}: {
  products: Product[];
  limit?: number;
  /** On the /deals page itself: the heading is the page's h1, and there's
   * no "see every deal" link back to where the shopper already is. */
  standalone?: boolean;
}) {
  const deals = toDeals(products).slice(0, limit);
  if (deals.length === 0) return null;
  const Heading = standalone ? 'h1' : 'h2';
  // One or two deals would leave most of a four-column band empty, so they
  // sit beside the heading as wider, horizontal cards instead.
  const few = deals.length <= 2;

  return (
    <section
      aria-labelledby="deals-heading"
      className={cn(
        'rounded-2xl bg-blue-700 p-5 text-white sm:p-8 dark:bg-blue-900',
        few
          ? 'space-y-5 lg:grid lg:grid-cols-[18rem_1fr] lg:items-center lg:gap-10 lg:space-y-0'
          : 'space-y-5',
      )}
    >
      <div
        className={cn(
          'flex flex-wrap justify-between gap-x-6 gap-y-2',
          few ? 'items-end lg:flex-col lg:items-start' : 'items-end',
        )}
      >
        <div className="space-y-1">
          <Heading
            id="deals-heading"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Hot deals
          </Heading>
          <p className="text-sm text-blue-100">
            Limited-time price cuts, and the lowest price among sellers.
          </p>
        </div>
        {standalone ? null : (
          <Link
            href="/deals"
            className="text-sm font-semibold text-white underline-offset-4 hover:underline"
          >
            See every deal
          </Link>
        )}
      </div>

      <ul
        className={
          few
            ? cn('grid gap-4', deals.length === 2 && 'md:grid-cols-2')
            : '-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0'
        }
      >
        {deals.map(({ product, deal, option }) => {
          const saving = deal.compareWith.amount - deal.price.amount;
          return (
            <li
              key={product.id}
              className={few ? 'min-w-0' : 'w-56 shrink-0 snap-start lg:w-auto'}
            >
              <Link
                href={getProductHref(product, deal.variant)}
                className={cn(
                  'bg-background text-foreground group flex h-full flex-col gap-3 rounded-xl p-3 focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none',
                  few && 'sm:flex-row sm:items-center sm:gap-5',
                )}
              >
                <div
                  className={cn(
                    'relative overflow-hidden rounded-lg',
                    few && 'sm:w-44 sm:shrink-0',
                  )}
                >
                  <ProductImage
                    src={getPrimaryImage(product)?.url ?? null}
                    alt={product.name}
                    sizes="(min-width: 1024px) 22vw, 14rem"
                    className="aspect-square rounded-lg"
                  />
                  <span className="absolute top-2 left-2 rounded-full bg-blue-600 px-2.5 py-1 text-sm font-bold text-white">
                    {deal.kind === 'sale'
                      ? `−${deal.percentOff}%`
                      : 'Best price'}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <p className="line-clamp-2 text-sm font-medium group-hover:underline">
                    {product.name}
                  </p>
                  {option ? (
                    <p className="text-muted-foreground text-xs">{option}</p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    Sold by {deal.offer.seller?.displayName ?? 'iZyane'}
                  </p>
                  <p className="mt-auto pt-1">
                    <span className="text-lg font-bold">
                      {formatMinor(deal.price.amount, deal.price.currency)}
                    </span>
                    {deal.kind === 'sale' ? (
                      <span className="text-muted-foreground ml-2 text-sm line-through">
                        <span className="sr-only">was </span>
                        {formatMinor(
                          deal.compareWith.amount,
                          deal.compareWith.currency,
                        )}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    {deal.kind === 'sale'
                      ? `You save ${formatMinor(saving, deal.price.currency)}${
                          deal.endsAt ? ` until ${endsOn(deal.endsAt)}` : ''
                        }`
                      : `${formatMinor(saving, deal.price.currency)} ${describeLeadRivals(deal.sellerCount ?? 2)}`}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
