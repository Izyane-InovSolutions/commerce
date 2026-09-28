'use client';

import Autoplay from 'embla-carousel-autoplay';
import { Flame } from 'lucide-react';
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
import {
  getDisplayPrice,
  getPrimaryImage,
  type Product,
} from '@/lib/catalog-types';

const ROTATE_MS = 6000;

/**
 * The homepage hero: one trending product per slide, sliding on its own
 * (pausing while hovered) with arrows and dots for anyone who wants to
 * browse by hand. Renders nothing when there's nothing trending, so the
 * page doesn't open on an empty banner.
 */
export function TrendingHero({ products }: { products: Product[] }) {
  // Lazy state initializer, same reasoning as promo-carousel-card.tsx.
  const [autoplayPlugin] = useState(() =>
    Autoplay({
      delay: ROTATE_MS,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    }),
  );
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!api) return;

    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();

    api.on('select', onSelect);
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api]);

  if (products.length === 0) return null;

  const hasMany = products.length > 1;

  return (
    <section aria-label="Trending products" className="relative">
      <Carousel
        setApi={setApi}
        opts={{ loop: hasMany }}
        plugins={hasMany ? [autoplayPlugin] : []}
        className="overflow-hidden rounded-2xl"
      >
        <CarouselContent className="ml-0">
          {products.map((product, index) => {
            const price = getDisplayPrice(product);
            return (
              <CarouselItem key={product.id} className="pl-0">
                <div className="relative isolate grid min-h-80 items-center gap-6 overflow-hidden bg-linear-to-br from-amber-500 via-orange-500 to-rose-600 p-6 sm:grid-cols-2 sm:p-10 lg:min-h-96">
                  <div className="justify-self-center space-y-6 text-white items-center gap-6">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                      <Flame className="size-3.5" aria-hidden="true" />
                      Trending now
                    </span>
                    <h2 className="text-3xl font-bold tracking-tight drop-shadow-sm sm:text-4xl lg:text-5xl">
                      {product.name}
                    </h2>
                    {product.description ? (
                      <p className="line-clamp-2 max-w-md text-sm text-white/90 sm:text-base">
                        {product.description}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="text-2xl font-semibold">
                        {price
                          ? formatMinor(price.amount, price.currency)
                          : 'Unavailable'}
                      </span>
                      <Link
                        href={`/products/${product.slug}`}
                        className="bg-background text-foreground hover:bg-background/90 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-sm transition-colors"
                      >
                        Shop now
                      </Link>
                    </div>
                  </div>

                  <ProductImage
                    src={getPrimaryImage(product)?.url ?? null}
                    alt={product.name}
                    sizes="(min-width: 640px) 40vw, 90vw"
                    className="aspect-square w-full max-w-sm justify-self-center rounded-2xl shadow-xl ring-4 ring-white/30"
                    iconClassName="size-16"
                  />
                  <span className="sr-only">
                    Slide {index + 1} of {products.length}
                  </span>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>

        {hasMany ? (
          <>
            <CarouselPrevious className="left-3 border-white/40 bg-black/10 text-white hover:bg-white/20 hover:text-white" />
            <CarouselNext className="right-3 border-white/40 bg-black/10 text-white hover:bg-white/20 hover:text-white" />
          </>
        ) : null}
      </Carousel>

      {hasMany ? (
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
          {products.map((product, position) => (
            <button
              key={product.id}
              type="button"
              aria-label={`Show ${product.name}`}
              aria-current={position === selected}
              onClick={() => api?.scrollTo(position)}
              className={`h-2 rounded-full transition-all ${
                position === selected ? 'w-6 bg-white' : 'w-2 bg-white/50'
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
