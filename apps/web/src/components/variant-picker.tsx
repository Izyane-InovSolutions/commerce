import Link from 'next/link';

import {
  getVariantLabel,
  getVariantOffer,
  type ProductVariant,
} from '@/lib/catalog-types';
import { cn } from '@/lib/utils';
import { buildOptionGroups } from '@/lib/variant-options';

function optionClass(selected: boolean, available: boolean): string {
  return cn(
    'rounded-lg border px-3 py-1.5 text-sm transition-colors',
    selected
      ? 'border-primary bg-primary text-primary-foreground'
      : 'hover:border-foreground/40',
    !available && !selected && 'text-muted-foreground line-through',
  );
}

/**
 * The product page's variant choice, as links to `?variant=<id>`.
 *
 * Variants that carry attributes (Color, Storage, Carrier…) get one row per
 * attribute, so a phone in 27 combinations is three short rows rather than
 * 27 buttons; picking a value keeps the other choices where that combination
 * exists. Variants without attributes are listed one button each.
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

  const selected = variants.find((variant) => variant.id === selectedId);
  const groups = selected ? buildOptionGroups(variants, selected) : null;
  const href = (variantId: string) =>
    `/products/${slug}?variant=${encodeURIComponent(variantId)}`;

  if (groups) {
    return (
      <div className="space-y-3">
        {groups.map((group) => {
          const current = group.values.find((value) => value.selected);
          return (
            <fieldset key={group.attributeId} className="space-y-2">
              <legend className="text-sm">
                <span className="font-medium">{group.name}</span>
                {current ? (
                  <span className="text-muted-foreground">
                    : {current.value}
                  </span>
                ) : null}
              </legend>
              <div className="flex flex-wrap gap-2">
                {group.values.map((option) => (
                  <Link
                    key={option.valueId}
                    href={href(option.variantId)}
                    replace
                    scroll={false}
                    aria-current={option.selected ? 'true' : undefined}
                    aria-label={
                      option.available
                        ? `${group.name}: ${option.value}`
                        : `${group.name}: ${option.value} (unavailable with your other choices)`
                    }
                    className={optionClass(option.selected, option.available)}
                  >
                    {option.value}
                  </Link>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    );
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
              href={href(variant.id)}
              replace
              scroll={false}
              aria-current={selected ? 'true' : undefined}
              aria-label={sellable ? label : `${label} (unavailable)`}
              className={optionClass(selected, sellable)}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </fieldset>
  );
}
