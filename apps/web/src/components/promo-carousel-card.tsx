'use client';

import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { ProductImage } from '@/components/product-image';
import { Button } from '@/components/ui/button';
import { formatMinor } from '@/lib/currency';
import { getDisplayPrice, getPrimaryImage, type Product } from '@/lib/catalog-types';

const ROTATE_MS = 5000;
const PAGE_SIZE = 3;

export function PromoCarouselCard({
  title,
  href,
  banner,
  products,
}: {
  title: string;
  href: string;
  banner: StaticImageData;
  products: Product[];
}) {
  const pageCount = Math.ceil(products.length / PAGE_SIZE);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (pageCount <= 1) return;
    const timer = setInterval(() => {
      setPage((current) => (current + 1) % pageCount);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [pageCount]);

  function go(delta: number): void {
    setPage((current) => (current + delta + pageCount) % pageCount);
  }


  const count = products.length;
  const visibleProducts = Array.from(
    { length: Math.min(PAGE_SIZE, count) },
    (_, offset) => products[(page * PAGE_SIZE + offset) % count]!,
  );

  return (
    <div className="relative isolate flex min-h-72 flex-col justify-between overflow-hidden rounded-2xl p-5">
      <Image
        src={banner}
        alt=""
        fill
        sizes="(min-width: 640px) 50vw, 100vw"
        className="-z-10 object-cover"
      />

      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-semibold tracking-tight text-white drop-shadow-sm">
          {title}
        </h3>
        <Link
          href={href}
          className="text-white text-foreground shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Shop all
        </Link>
      </div>

      {visibleProducts.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            {pageCount > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => go(-1)}
                aria-label="Previous products"
                className="shrink-0 text-white hover:bg-white/20 hover:text-white"
              >
                <ChevronLeft />
              </Button>
            ) : null}

            <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
              {visibleProducts.map((product) => {
                const price = getDisplayPrice(product);
                return (
                  <Link
                    key={product.id}
                    href={`/products/${product.slug}`}
                    className="min-w-0 space-y-1 text-center"
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
                );
              })}
            </div>

            {pageCount > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => go(1)}
                aria-label="Next products"
                className="shrink-0 text-white hover:bg-white/20 hover:text-white"
              >
                <ChevronRight />
              </Button>
            ) : null}
          </div>

          {pageCount > 1 ? (
            <div className="flex justify-center gap-1.5">
              {Array.from({ length: pageCount }, (_, position) => (
                <button
                  key={position}
                  type="button"
                  aria-label={`Show products ${position + 1} of ${pageCount}`}
                  aria-current={position === page}
                  onClick={() => setPage(position)}
                  className={`size-1.5 rounded-full transition-colors ${
                    position === page ? 'bg-white' : 'bg-white/50'
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
