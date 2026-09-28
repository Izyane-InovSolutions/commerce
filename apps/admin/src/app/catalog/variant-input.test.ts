import { describe, expect, it } from 'vitest';

import { variantCreateInput, variantUpdateInput } from './variant-input';

const RED = '0b6d6a4e-7f38-4e0c-9d8e-1f1f5b1c2a01';
const LARGE = '0b6d6a4e-7f38-4e0c-9d8e-1f1f5b1c2a02';

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) {
    data.append(key, value);
  }
  return data;
}

describe('variantUpdateInput', () => {
  it('sends every chosen value and skips unchosen attributes', () => {
    expect(
      variantUpdateInput(
        form([
          ['skuCode', ' TEE-RED-L '],
          ['name', 'Red / Large'],
          ['attributesShown', '1'],
          ['attributeValueIds', RED],
          ['attributeValueIds', ''],
          ['attributeValueIds', LARGE],
        ]),
      ),
    ).toEqual({
      skuCode: 'TEE-RED-L',
      name: 'Red / Large',
      attributeValueIds: [RED, LARGE],
    });
  });

  it('sends an empty set when the pickers were shown and all cleared', () => {
    expect(
      variantUpdateInput(
        form([
          ['skuCode', 'TEE'],
          ['name', ''],
          ['attributesShown', '1'],
          ['attributeValueIds', ''],
        ]),
      ).attributeValueIds,
    ).toEqual([]);
  });

  it('leaves the values alone when the pickers were not rendered', () => {
    const input = variantUpdateInput(form([['skuCode', 'TEE']]));
    expect(input.attributeValueIds).toBeUndefined();
    expect(input.name).toBe('');
  });

  it('drops a value picked twice', () => {
    expect(
      variantUpdateInput(
        form([
          ['skuCode', 'TEE'],
          ['attributesShown', '1'],
          ['attributeValueIds', RED],
          ['attributeValueIds', RED],
        ]),
      ).attributeValueIds,
    ).toEqual([RED]);
  });
});

describe('variantCreateInput', () => {
  it('leaves out a blank name and an empty set of values', () => {
    expect(
      variantCreateInput(
        form([
          ['skuCode', 'TEE'],
          ['name', '  '],
          ['attributesShown', '1'],
          ['attributeValueIds', ''],
        ]),
      ),
    ).toEqual({ skuCode: 'TEE', name: undefined, attributeValueIds: undefined });
  });

  it('carries chosen values onto the new variant', () => {
    expect(
      variantCreateInput(
        form([
          ['skuCode', 'TEE'],
          ['attributesShown', '1'],
          ['attributeValueIds', LARGE],
        ]),
      ).attributeValueIds,
    ).toEqual([LARGE]);
  });
});
