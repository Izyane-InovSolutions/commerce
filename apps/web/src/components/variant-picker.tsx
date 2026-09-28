import Link from 'next/link';

import {
  getVariantLabel,
  getVariantOffer,
  type ProductVariant,
} from '@/lib/catalog-types';
import { cn } from '@/lib/utils';

/**
 * One button per variant of a product, as links to `?variant=<id>`.
 *
 * The choice lives in the URL rather than in client state: the server then
 * renders that variant's own price, stock, offer and "Other sellers" list
 * directly, so what's shown and what "Add to cart" posts always agree. A
 * variant nobody is selling right now still shows, but struck through.
 */
export function VariantPicker({
  slug,
  variants,
  selectedId,
}: {
  slug: string;
  variants: ProductVariant[];
  selectedId: string;
}) {
  if (variants.length < 2) {
    return null;
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Options</legend>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => {
          const selected = variant.id === selectedId;
          const sellable = getVariantOffer(variant) !== null;
          const label = getVariantLabel(variant);
          return (
            <Link
              key={variant.id}
              href={`/products/${slug}?variant=${encodeURIComponent(variant.id)}`}
              replace
              scroll={false}
              aria-current={selected ? 'true' : undefined}
              aria-label={sellable ? label : `${label} (unavailable)`}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:border-foreground/40',
                !sellable && !selected && 'text-muted-foreground line-through',
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </fieldset>
  );
}
