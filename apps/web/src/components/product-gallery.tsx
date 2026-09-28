'use client';

import Image from 'next/image';
import { useState } from 'react';

import { ProductImage } from '@/components/product-image';
import type { ProductMedia } from '@/lib/catalog-types';
import { cn } from '@/lib/utils';

/**
 * The product page's images: one large, with a thumbnail strip to switch
 * between them when there's more than one.
 *
 * `media` arrives already in display order (see `getOrderedMedia`), so the
 * first entry — the primary image — is what shows before anything is picked.
 */
export function ProductGallery({
  media,
  alt,
}: {
  media: ProductMedia[];
  alt: string;
}) {
  const [selectedId, setSelectedId] = useState(media[0]?.id ?? null);
  const selected =
    media.find((image) => image.id === selectedId) ?? media[0] ?? null;

  return (
    <div className="space-y-3">
      <ProductImage
        src={selected?.url ?? null}
        alt={alt}
        sizes="(min-width: 640px) 50vw, 100vw"
        className="aspect-square rounded-2xl"
        iconClassName="size-16"
      />

      {media.length > 1 ? (
        <ul
          className="flex gap-2 overflow-x-auto pb-1"
          aria-label="Product images"
        >
          {media.map((image, index) => {
            const isSelected = image.id === selected?.id;
            return (
              <li key={image.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(image.id)}
                  aria-label={`Show image ${index + 1} of ${media.length}`}
                  aria-pressed={isSelected}
                  className={cn(
                    'bg-muted relative block size-16 overflow-hidden rounded-lg border-2 transition-colors',
                    isSelected
                      ? 'border-primary'
                      : 'border-transparent hover:border-foreground/20',
                  )}
                >
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                    unoptimized
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
