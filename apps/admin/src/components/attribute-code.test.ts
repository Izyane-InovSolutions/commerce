import { describe, expect, it } from 'vitest';

import { toAttributeCode } from './attribute-code';

describe('toAttributeCode', () => {
  it('kebab-cases a name', () => {
    expect(toAttributeCode('Screen size')).toBe('screen-size');
    expect(toAttributeCode('  Colour / Finish  ')).toBe('colour-finish');
  });

  it('drops accents rather than the letters under them', () => {
    expect(toAttributeCode('Matériau')).toBe('materiau');
  });

  it('matches the API rule for anything it produces', () => {
    for (const name of ['RAM (GB)', '--x--', 'Size 2', 'ÆØÅ']) {
      const code = toAttributeCode(name);
      if (code !== '') {
        expect(code).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      }
    }
  });
});
