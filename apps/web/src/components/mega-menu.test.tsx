import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Category } from '@/lib/catalog-types';
import { buildCategoryTree, groupBrandsByLetter } from '@/lib/menu-data';

import { MegaMenu } from './mega-menu';

function category(
  id: string,
  name: string,
  parentId: string | null = null,
): Category {
  return { id, name, slug: id, description: null, parentId, position: 0 };
}

const categories = buildCategoryTree([
  category('electronics', 'Electronics'),
  category('phones', 'Smartphones', 'electronics'),
  category('laptops', 'Laptops', 'electronics'),
  category('fashion', 'Fashion'),
  category('shoes', 'Shoes', 'fashion'),
]);
const brands = groupBrandsByLetter([
  { id: 'apple', name: 'Apple', slug: 'apple', description: null },
  { id: 'sony', name: 'Sony', slug: 'sony', description: null },
]);

/** Radix opens a menu on click; pointer-move is what hover intent needs. */
function open(trigger: HTMLElement): void {
  act(() => {
    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' });
    fireEvent.click(trigger);
  });
}

describe('MegaMenu', () => {
  it('carries the everyday destinations in the bar itself', () => {
    render(<MegaMenu categories={categories} brands={brands} />);
    const shop = screen.getByRole('navigation', { name: 'Shop' });

    for (const [name, href] of [
      ['Hot deals', '/deals'],
      ['New arrivals', '/new-arrivals'],
      ['Best sellers', '/best-sellers'],
      ['Track an order', '/account?tab=orders'],
    ]) {
      expect(within(shop).getByRole('link', { name })).toHaveAttribute(
        'href',
        href,
      );
    }
  });

  it("opens categories with the first one's sub-categories, and follows hover", () => {
    render(<MegaMenu categories={categories} brands={brands} />);
    open(screen.getByRole('button', { name: 'Categories' }));

    expect(screen.getByRole('link', { name: 'Smartphones' })).toHaveAttribute(
      'href',
      '/products?category=phones',
    );
    expect(
      screen.getByRole('link', { name: 'Shop all Electronics' }),
    ).toBeInTheDocument();

    act(() => {
      fireEvent.mouseEnter(screen.getByRole('link', { name: 'Fashion' }));
    });
    expect(screen.getByRole('link', { name: 'Shoes' })).toHaveAttribute(
      'href',
      '/products?category=shoes',
    );
    expect(screen.queryByRole('link', { name: 'Smartphones' })).toBeNull();
    // Quick links travel with every panel.
    expect(
      screen.getByRole('link', { name: 'Recently viewed' }),
    ).toHaveAttribute('href', '/account?tab=recently-viewed');
  });

  it('lists brands under their letter', () => {
    render(<MegaMenu categories={categories} brands={brands} />);
    open(screen.getByRole('button', { name: 'Brands' }));

    expect(screen.getByRole('link', { name: 'Apple' })).toHaveAttribute(
      'href',
      '/products?brand=apple',
    );
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('hides a panel it has nothing for', () => {
    render(<MegaMenu categories={[]} brands={[]} />);
    expect(
      screen.queryByRole('button', { name: 'Categories' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Brands' }),
    ).not.toBeInTheDocument();
  });
});
