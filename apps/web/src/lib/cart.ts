import type { CartItem } from './cart-context';
import { getProductById, type Product } from './mock-data/products';

export type CartLine = {
  product: Product;
  quantity: number;
  lineTotal: number;
};

export function resolveCartLines(items: CartItem[]): CartLine[] {
  return items.flatMap((item) => {
    const product = getProductById(item.productId);
    return product
      ? [
          {
            product,
            quantity: item.quantity,
            lineTotal: product.price * item.quantity,
          },
        ]
      : [];
  });
}

export function getCartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0);
}
