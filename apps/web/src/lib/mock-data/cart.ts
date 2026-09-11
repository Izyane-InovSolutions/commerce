import { getProductById, type Product } from './products';

export type CartLine = {
  product: Product;
  quantity: number;
  lineTotal: number;
};

const mockCartItems = [
  { productId: 'na-1', quantity: 1 },
  { productId: 'bs-3', quantity: 2 },
  { productId: 'dl-4', quantity: 1 },
];

/**
 * Placeholder cart contents for the checkout page. Replace with a real fetch
 * against the cart module once it ships in Phase 1.
 */
export function getMockCartLines(): CartLine[] {
  return mockCartItems.flatMap(({ productId, quantity }) => {
    const product = getProductById(productId);
    return product
      ? [{ product, quantity, lineTotal: product.price * quantity }]
      : [];
  });
}

export function getMockCartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0);
}
