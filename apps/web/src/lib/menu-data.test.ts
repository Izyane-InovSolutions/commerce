import { describe, expect, it } from 'vitest';

import type { Brand, Category } from './catalog-types';
import { buildCategoryTree, groupBrandsByLetter } from './menu-data';

function category(id: string, parentId: string | null, position = 0): Category {
  return { id, name: id, slug: id, description: null, parentId, position };
}

function brand(name: string): Brand {
  return { id: name, name, slug: name.toLowerCase(), description: null };
}

describe('buildCategoryTree', () => {
  it('nests direct children under their top-level parent, in position order', () => {
    const tree = buildCategoryTree([
      category('phones', 'electronics', 1),
      category('fashion', null, 1),
      category('electronics', null, 0),
      category('laptops', 'electronics', 0),
      category('cases', 'phones'),
    ]);

    expect(
      tree.map((branch) => [
        branch.category.id,
        branch.children.map((child) => child.id),
      ]),
    ).toEqual([
      ['electronics', ['laptops', 'phones']],
      ['fashion', []],
    ]);
  });

  it('treats a category whose parent is missing as top-level', () => {
    expect(
      buildCategoryTree([category('orphan', 'gone')]).map(
        (branch) => branch.category.id,
      ),
    ).toEqual(['orphan']);
  });
});

describe('groupBrandsByLetter', () => {
  it('groups A–Z with non-letters last under #', () => {
    expect(
      groupBrandsByLetter([
        brand('Samsung'),
        brand('3M'),
        brand('apple'),
        brand('Sony'),
      ]).map((group) => [group.letter, group.brands.map((b) => b.name)]),
    ).toEqual([
      ['A', ['apple']],
      ['S', ['Samsung', 'Sony']],
      ['#', ['3M']],
    ]);
  });
});
