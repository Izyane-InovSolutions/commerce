'use client';

import { useEffect } from 'react';

import { recordProductView } from '@/lib/recently-viewed';

/**
 * Drops this product into the visitor's recently-viewed list on mount.
 *
 * Renders nothing — it exists purely for the effect, on a product detail
 * page that is otherwise a server component and so cannot touch
 * `localStorage` itself.
 */
export function RecordProductView({
  id,
  slug,
  name,
  imageUrl,
  priceAmount,
  priceCurrency,
  categorySlug = null,
}: {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  categorySlug?: string | null;
}) {
  useEffect(() => {
    recordProductView({
      id,
      slug,
      name,
      imageUrl,
      price:
        priceAmount !== null && priceCurrency !== null
          ? { amount: priceAmount, currency: priceCurrency }
          : null,
      categorySlug,
    });
  }, [id, slug, name, imageUrl, priceAmount, priceCurrency, categorySlug]);

  return null;
}
