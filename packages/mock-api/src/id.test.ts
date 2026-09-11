import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { id } from './id.ts';

describe('id', () => {
  it('produces a well-formed uuid', () => {
    expect(z.uuid().safeParse(id('sku:DESK-OAK-140')).success).toBe(true);
  });

  it('is stable for the same name', () => {
    expect(id('product:standing-desk')).toBe(id('product:standing-desk'));
  });

  it('differs for different names', () => {
    const ids = new Set(
      ['a', 'b', 'c', 'sku:1', 'sku:2', 'product:1'].map((name) => id(name)),
    );
    expect(ids.size).toBe(6);
  });
});
