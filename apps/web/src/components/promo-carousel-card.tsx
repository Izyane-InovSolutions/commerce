'use client';

import Autoplay from 'embla-carousel-autoplay';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ProductImage } from '@/components/product-image';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { formatMinor } from '@/lib/currency';
import { getDisplayPrice, getPrimaryImage, type Product } from '@/lib/catalog-types';

const ROTATE_MS = 5000;
const PAGE_SIZE = 3;

/**
 * A promo card with a gradient backdrop that pages through a handful of
 * products, three at a time — built on shadcn/ui's Carousel (Embla), so
 * advancing actually slides rather than swapping instantly. `href` is where
 * "Shop all" sends someone who wants the full list rather than this preview.
 */
export function PromoCarouselCard({
  title,
  href,
  gradientClassName,
  products,
}: {
  title: string;
  href: string;
  /** The card's own background gradient, e.g. `bg-linear-to-br from-amber-500 to-rose-600`. */
  gradientClassName: string;
  products: Product[];
}) {
  // A lazy initializer, not a ref: the plugin instance still only gets
  // built once, but as actual state it's safe to read during render —
  // unlike a ref, which React Compiler assumes may be stale there.
  const [autoplayPlugin] = useState(() =>
    Autoplay({ delay: ROTATE_MS, stopOnInteraction: false }),
  );
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [snapCount, setSnapCount] = useState(0);

  useEffect(() => {
    if (!api) return;

    const onSelect = () => setSelected(api.selectedScrollSnap());
    // Same one-time sync of Embla's own initial state as ui/carousel.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnapCount(api.scrollSnapList().length);
    onSelect();

    api.on('select', onSelect);
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api]);

  return (
    <div
      className={`relative isolate flex min-h-72 flex-col justify-between overflow-hidden rounded-2xl p-5 ${gradientClassName}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-semibold tracking-tight text-white drop-shadow-sm">
          {title}
        </h3>
        <Link
          href={href}
          className="bg-background/90 text-foreground hover:bg-background shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Shop all
        </Link>
      </div>

      {products.length > 0 ? (
        <div className="space-y-2">
          <Carousel
            setApi={setApi}
            opts={{
              loop: products.length > PAGE_SIZE,
              align: 'start',
              slidesToScroll: PAGE_SIZE,
            }}
            plugins={products.length > PAGE_SIZE ? [autoplayPlugin] : []}
            className="px-6"
          >
            <CarouselContent className="-ml-2">
              {products.map((product) => {
                const price = getDisplayPrice(product);
                return (
                  <CarouselItem key={product.id} className="basis-1/3 pl-2">
                    <Link
                      href={`/products/${product.slug}`}
                      className="block min-w-0 space-y-1 text-center"
                    >
                      <ProductImage
                        src={getPrimaryImage(product)?.url ?? null}
                        alt={product.name}
                        sizes="80px"
                        className="mx-auto aspect-square w-full rounded-lg"
                      />
                      <p className="truncate text-xs font-medium text-white drop-shadow-sm">
                        {product.name}
                      </p>
                      <p className="truncate text-xs font-semibold text-white drop-shadow-sm">
                        {price
                          ? formatMinor(price.amount, price.currency)
                          : 'Unavailable'}
                      </p>
                    </Link>
                  </CarouselItem>
                );
              })}
            </CarouselContent>

            {snapCount > 1 ? (
              <>
                <CarouselPrevious className="left-0 size-7 border-white/40 bg-transparent text-white hover:bg-white/20 hover:text-white" />
                <CarouselNext className="right-0 size-7 border-white/40 bg-transparent text-white hover:bg-white/20 hover:text-white" />
              </>
            ) : null}
          </Carousel>

          {snapCount > 1 ? (
            <div className="flex justify-center gap-1.5">
              {Array.from({ length: snapCount }, (_, position) => (
                <button
                  key={position}
                  type="button"
                  aria-label={`Show products ${position + 1} of ${snapCount}`}
                  aria-current={position === selected}
                  onClick={() => api?.scrollTo(position)}
                  className={`size-1.5 rounded-full transition-colors ${
                    position === selected ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
