import type { CartItem } from './cart-context';

export type CartLine = CartItem & { lineTotal: number };

export function resolveCartLines(items: CartItem[]): CartLine[] {
  return items.map((item) => ({
    ...item,
    lineTotal: item.unitPrice * item.quantity,
  }));
}

export function getCartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0);
}
