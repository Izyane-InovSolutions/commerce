import {
  getVariantOffer,
  type ProductVariant,
  type VariantAttribute,
} from '@/lib/catalog-types';

/** One attribute's row in the picker, e.g. Storage: 128GB · 256GB · 512GB. */
export type OptionGroup = {
  attributeId: string;
  name: string;
  values: OptionValue[];
};

export type OptionValue = {
  valueId: string;
  value: string;
  /** Whether the selected variant carries this value. */
  selected: boolean;
  /** Where choosing this value goes: the variant with the other current
   * choices kept, or the closest one when that exact combination doesn't
   * exist. */
  variantId: string;
  /** False when that exact combination doesn't exist or isn't on sale. */
  available: boolean;
};

function valueOf(
  variant: ProductVariant,
  attributeId: string,
): VariantAttribute | undefined {
  return variant.attributes?.find((entry) => entry.attributeId === attributeId);
}

/**
 * The variant to show when a shopper picks `valueId` for `attributeId`,
 * starting from `selected`.
 *
 * Keeps every other choice where it can: the variant sharing the most of the
 * current values wins, a sellable one breaks a tie, and list order breaks the
 * rest — so switching Storage on a Black / Unlocked phone stays Black /
 * Unlocked unless that storage only exists in another colour.
 */
function closestVariant(
  variants: ProductVariant[],
  selected: ProductVariant,
  attributeId: string,
  valueId: string,
): ProductVariant {
  const candidates = variants.filter(
    (variant) => valueOf(variant, attributeId)?.valueId === valueId,
  );

  let best = candidates[0]!;
  let bestScore = -1;
  for (const candidate of candidates) {
    const shared = (selected.attributes ?? []).filter(
      (entry) =>
        entry.attributeId !== attributeId &&
        valueOf(candidate, entry.attributeId)?.valueId === entry.valueId,
    ).length;
    // Sharing values matters more than being on sale; on-sale breaks ties.
    const score = shared * 2 + (getVariantOffer(candidate) ? 1 : 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Groups a product's variants into one row per attribute, or returns null
 * when they can't be (a variant without attributes, or variants that don't
 * all carry the same attributes) — the picker then lists variants flat.
 */
export function buildOptionGroups(
  variants: ProductVariant[],
  selected: ProductVariant,
): OptionGroup[] | null {
  const first = variants[0]?.attributes ?? [];
  if (first.length === 0) return null;

  const attributeIds = first.map((entry) => entry.attributeId);
  const consistent = variants.every(
    (variant) =>
      (variant.attributes ?? []).length === attributeIds.length &&
      attributeIds.every((id) => valueOf(variant, id)),
  );
  if (!consistent) return null;

  return first.map(({ attributeId, attributeName }) => {
    // First-seen order, which follows the order variants were created in.
    const seen = new Map<string, string>();
    for (const variant of variants) {
      const entry = valueOf(variant, attributeId)!;
      if (!seen.has(entry.valueId)) seen.set(entry.valueId, entry.value);
    }

    const current = valueOf(selected, attributeId)?.valueId;
    return {
      attributeId,
      name: attributeName,
      values: [...seen].map(([valueId, value]) => {
        const target = closestVariant(variants, selected, attributeId, valueId);
        const exact = (selected.attributes ?? []).every(
          (entry) =>
            entry.attributeId === attributeId ||
            valueOf(target, entry.attributeId)?.valueId === entry.valueId,
        );
        return {
          valueId,
          value,
          selected: valueId === current,
          variantId: target.id,
          available: exact && getVariantOffer(target) !== null,
        };
      }),
    };
  });
}
