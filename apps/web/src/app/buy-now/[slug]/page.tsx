import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { BackButton } from '@/components/back-button';
import { BuyNowContent } from '@/components/buy-now-content';
import { Button } from '@/components/ui/button';
import { getProductBySlug } from '@/lib/catalog';
import {
  getDisplayPrice,
  getPrimaryImage,
  getPrimaryOffer,
} from '@/lib/catalog-types';
import { listAddresses } from '@/lib/orders';
import { getCurrentUser } from '@/lib/session';

import { buyNowAction, createAddressAction } from '../actions';

/** Buy now always checks out a single unit — same as "Add to cart" does. */
const QUANTITY = 1;

type BuyNowPageProps = PageProps<'/buy-now/[slug]'>;

export async function generateMetadata({
  params,
}: BuyNowPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  return { title: product ? `Buy ${product.name}` : 'Buy now' };
}

export default async function BuyNowPage({ params }: BuyNowPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Buy now</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Sign in to buy this. Buying now still needs an account to ship and
          pay to, the same as checkout does.
        </p>
        <Button asChild size="sm">
          <Link href="/account">Sign in</Link>
        </Button>
      </div>
    );
  }

  const offer = getPrimaryOffer(product);
  const price = getDisplayPrice(product);

  if (!offer || !price) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Buy now</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          {product.name} is not currently available to buy.
        </p>
        <Button asChild size="sm">
          <Link href={`/products/${product.slug}`}>Back to product</Link>
        </Button>
      </div>
    );
  }

  let addresses;

  try {
    addresses = await listAddresses();
  } catch (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Buy now</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <BackButton />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Buy now</h1>
      <p className="text-muted-foreground mt-1 text-sm text-pretty">
        Prices and stock are confirmed by the Commerce API as the order is
        placed, not from what this page last saw.
      </p>

      <div className="mt-8">
        <BuyNowContent
          name={product.name}
          imageUrl={getPrimaryImage(product)?.url ?? null}
          quantity={QUANTITY}
          unitAmount={price.amount}
          currency={price.currency}
          addresses={addresses}
          placeOrder={buyNowAction.bind(null, offer.id, QUANTITY)}
          createAddress={createAddressAction}
        />
      </div>
    </div>
  );
}
