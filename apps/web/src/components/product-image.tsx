import Image from 'next/image';
import { PackageSearch } from 'lucide-react';

/**
 * A product's image, or the placeholder that stands in for one.
 *
 * Every surface that shows a product needs the same fallback — a product
 * without an image is normal, not an error — so the choice lives here rather
 * than being repeated at each call site.
 *
 * `src` is the API's signed URL, relative to its origin, which this app
 * proxies under the same path (see `next.config.ts`).
 */
export function ProductImage({
  src,
  alt,
  sizes,
  className,
  iconClassName,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  className?: string;
  iconClassName?: string;
}) {
  if (!src) {
    return (
      <div className={`bg-muted grid place-items-center ${className ?? ''}`}>
        <PackageSearch
          className={`text-muted-foreground ${iconClassName ?? 'size-8'}`}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <div className={`bg-muted relative overflow-hidden ${className ?? ''}`}>
      <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
    </div>
  );
}
