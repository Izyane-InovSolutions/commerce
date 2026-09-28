import type { BackendAdminProduct } from '@commerce/contracts';

/**
 * Orders, fulfillment lines, and purchase orders name a variant or an offer
 * by id and nothing else, so a page that wants to show "Blue kettle — KET-01"
 * joins against the catalog. The admin product list carries every variant
 * and every offer under it, so one read labels a whole page.
 */

export type VariantLabel = {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string | null;
  sku: string;
};

export type CatalogIndex = {
  byVariant: Map<string, VariantLabel>;
  byOffer: Map<string, VariantLabel>;
};

export function buildCatalogIndex(products: BackendAdminProduct[]): CatalogIndex {
  const byVariant = new Map<string, VariantLabel>();
  const byOffer = new Map<string, VariantLabel>();

  for (const product of products) {
    for (const variant of product.variants) {
      const label: VariantLabel = {
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantName: variant.name,
        sku: variant.skuCode,
      };
      byVariant.set(variant.id, label);
      for (const offer of variant.offers) {
        byOffer.set(offer.id, label);
      }
    }
  }

  return { byVariant, byOffer };
}

/**
 * "Product — Variant (SKU)", dropping whichever part is missing; falls back
 * to a short id so an unlabelled row still identifies itself.
 */
export function describeVariant(
  label: VariantLabel | undefined,
  fallbackId: string,
  kind = 'Variant',
): { title: string; detail: string } {
  if (!label) {
    return { title: `${kind} ${fallbackId.slice(0, 8)}`, detail: 'Not in the catalog' };
  }
  return {
    title: label.variantName
      ? `${label.productName} — ${label.variantName}`
      : label.productName,
    detail: label.sku,
  };
}

/** Options for a variant picker, sorted by product then SKU. */
export function variantOptions(
  index: CatalogIndex,
): { value: string; label: string }[] {
  return [...index.byVariant.values()]
    .sort(
      (left, right) =>
        left.productName.localeCompare(right.productName) ||
        left.sku.localeCompare(right.sku),
    )
    .map((label) => ({
      value: label.variantId,
      label: `${describeVariant(label, label.variantId).title} (${label.sku})`,
    }));
}
