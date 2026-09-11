import { describe, expect, it } from 'vitest';

import {
  createProductSchema,
  updateProductSchema,
  updateSellerProductSchema,
} from './catalog.ts';
import { createOfferSchema } from './offers.ts';
import { adjustInventorySchema } from './inventory.ts';

const validProduct = {
  name: 'Standing desk',
  slug: 'standing-desk',
  variants: [{ name: 'Oak / 140cm', skuCode: 'DESK-OAK-140' }],
};

describe('createProductSchema', () => {
  it('applies defaults for the optional fields', () => {
    const parsed = createProductSchema.parse(validProduct);

    expect(parsed.status).toBe('draft');
    expect(parsed.description).toBe('');
    expect(parsed.brandId).toBeNull();
    expect(parsed.variants[0]?.attributes).toEqual({});
  });

  it('requires at least one variant', () => {
    const result = createProductSchema.safeParse({
      ...validProduct,
      variants: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a slug that is not url safe', () => {
    for (const slug of ['Standing Desk', 'standing_desk', 'standing--desk']) {
      expect(
        createProductSchema.safeParse({ ...validProduct, slug }).success,
      ).toBe(false);
    }
  });

  it('rejects a lowercase sku code', () => {
    const result = createProductSchema.safeParse({
      ...validProduct,
      variants: [{ name: 'Oak', skuCode: 'desk-oak-140' }],
    });

    expect(result.success).toBe(false);
  });
});

describe('updateProductSchema', () => {
  it('leaves out what the caller did not mention', () => {
    const parsed = updateProductSchema.parse({ status: 'archived' });

    // A defaulted field must not reappear here — it would overwrite the
    // stored value with the default.
    expect(parsed).toEqual({ status: 'archived' });
    expect('description' in parsed).toBe(false);
    expect('brandId' in parsed).toBe(false);
  });

  it('still accepts an explicit null to clear a field', () => {
    expect(updateProductSchema.parse({ brandId: null })).toEqual({
      brandId: null,
    });
  });
});

describe('updateSellerProductSchema', () => {
  it('does not submit a draft as a side effect of editing it', () => {
    const parsed = updateSellerProductSchema.parse({ name: 'Renamed' });

    expect('status' in parsed).toBe(false);
  });

  it('admits only draft or pending when status is given', () => {
    expect(updateSellerProductSchema.parse({ status: 'draft' }).status).toBe(
      'draft',
    );
    expect(
      updateSellerProductSchema.safeParse({ status: 'active' }).success,
    ).toBe(false);
  });
});

describe('createOfferSchema', () => {
  const skuId = '11111111-1111-4111-8111-111111111111';

  it('accepts a decimal price and defaults the commercial fields', () => {
    const parsed = createOfferSchema.parse({ skuId, price: '249.99' });

    expect(parsed.condition).toBe('new');
    expect(parsed.status).toBe('draft');
    expect(parsed.fulfillmentMode).toBe('seller');
    expect(parsed.handlingTimeDays).toBe(1);
    expect(parsed.currency).toBe('GBP');
  });

  it('rejects a price with more than two decimal places', () => {
    expect(
      createOfferSchema.safeParse({ skuId, price: '249.999' }).success,
    ).toBe(false);
  });

  it('treats an empty compare-at price as absent', () => {
    const parsed = createOfferSchema.parse({
      skuId,
      price: '10.00',
      compareAtPrice: '',
    });

    expect(parsed.compareAtPrice).toBe('');
  });

  it('caps handling time at 30 days', () => {
    expect(
      createOfferSchema.safeParse({ skuId, price: '10', handlingTimeDays: 31 })
        .success,
    ).toBe(false);
  });
});

describe('adjustInventorySchema', () => {
  const ids = {
    skuId: '11111111-1111-4111-8111-111111111111',
    locationId: '22222222-2222-4222-8222-222222222222',
  };

  it('accepts a negative delta', () => {
    const parsed = adjustInventorySchema.parse({
      ...ids,
      delta: -3,
      reason: 'damaged',
    });

    expect(parsed.delta).toBe(-3);
  });

  it('rejects a zero delta', () => {
    expect(
      adjustInventorySchema.safeParse({
        ...ids,
        delta: 0,
        reason: 'correction',
      }).success,
    ).toBe(false);
  });
});
