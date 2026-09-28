import { describe, expect, it } from 'vitest';

import type { ProductVariant } from './catalog-types';
import { buildOptionGroups } from './variant-options';

function variant(
  id: string,
  color: string,
  storage: string,
  { onSale = true }: { onSale?: boolean } = {},
): ProductVariant {
  return {
    id,
    skuCode: id.toUpperCase(),
    name: null,
    attributes: [
      {
        attributeId: 'color',
        attributeName: 'Color',
        valueId: color,
        value: color,
      },
      {
        attributeId: 'storage',
        attributeName: 'Storage',
        valueId: storage,
        value: storage,
      },
    ],
    offers: onSale
      ? [
          {
            id: `${id}-offer`,
            status: 'PUBLISHED',
            currentPrice: { amount: 100, currency: 'ZMW' },
            currencies: ['ZMW'],
            inStock: true,
            shippingCost: null,
          },
        ]
      : [],
  };
}

const blackSmall = variant('black-128', 'Black', '128GB');
const blackLarge = variant('black-256', 'Black', '256GB');
const silverSmall = variant('silver-128', 'Silver', '128GB');
// No Silver / 256GB exists.

describe('buildOptionGroups', () => {
  it('makes one row per attribute, values in first-seen order', () => {
    const groups = buildOptionGroups(
      [blackSmall, blackLarge, silverSmall],
      blackSmall,
    )!;

    expect(groups.map((group) => group.name)).toEqual(['Color', 'Storage']);
    expect(groups[0]!.values.map((value) => value.value)).toEqual([
      'Black',
      'Silver',
    ]);
    expect(groups[1]!.values.map((value) => value.value)).toEqual([
      '128GB',
      '256GB',
    ]);
  });

  it('keeps the other choices when switching one value', () => {
    const [color, storage] = buildOptionGroups(
      [blackSmall, blackLarge, silverSmall],
      blackSmall,
    )!;

    expect(storage!.values.find((v) => v.value === '256GB')).toMatchObject({
      variantId: 'black-256',
      available: true,
      selected: false,
    });
    expect(color!.values.find((v) => v.value === 'Silver')).toMatchObject({
      variantId: 'silver-128',
      available: true,
    });
  });

  it('falls back to the closest variant when the combination does not exist', () => {
    const [color] = buildOptionGroups(
      [blackSmall, blackLarge, silverSmall],
      blackLarge,
    )!;

    // Black / 256GB → Silver has no 256GB, so it lands on Silver / 128GB and
    // is marked unavailable for the current selection.
    expect(color!.values.find((v) => v.value === 'Silver')).toMatchObject({
      variantId: 'silver-128',
      available: false,
    });
  });

  it('marks a combination that exists but is not on sale as unavailable', () => {
    const soldOut = variant('silver-256', 'Silver', '256GB', { onSale: false });
    const [color] = buildOptionGroups(
      [blackSmall, blackLarge, silverSmall, soldOut],
      blackLarge,
    )!;

    expect(color!.values.find((v) => v.value === 'Silver')).toMatchObject({
      variantId: 'silver-256',
      available: false,
    });
  });

  it('returns null when variants have no attributes to group by', () => {
    const plain: ProductVariant = { ...blackSmall, attributes: [] };
    expect(buildOptionGroups([plain], plain)).toBeNull();
  });

  it('returns null when variants carry different attributes', () => {
    const colourOnly: ProductVariant = {
      ...silverSmall,
      attributes: silverSmall.attributes!.slice(0, 1),
    };
    expect(buildOptionGroups([blackSmall, colourOnly], blackSmall)).toBeNull();
  });
});
