'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * A cart line snapshots the product's name and price at add-to-cart time,
 * keyed by slug. The cart has no server component of its own yet, so there's
 * nothing to re-fetch this against later; that also keeps the cart and
 * checkout views simple, synchronous, and independent of the catalog API.
 */
export type CartItem = {
  slug: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  addItem: (item: { slug: string; name: string; unitPrice: number }) => void;
  removeItem: (slug: string) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = 'commerce-cart';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // One-time hydration from localStorage after mount: `items` must start
    // empty so the server render and the first client render match, then we
    // load the persisted cart. That intentionally means one extra render.
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setItems(JSON.parse(stored) as CartItem[]);
      }
    } catch {
      // Storage may be unavailable or hold malformed data; start with an empty cart.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage may be unavailable (e.g. disabled or full); the cart still
      // works for the rest of the session, it just won't persist.
    }
  }, [items, hydrated]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      addItem: ({ slug, name, unitPrice }) => {
        setItems((current) => {
          const existing = current.find((item) => item.slug === slug);
          if (existing) {
            return current.map((item) =>
              item.slug === slug
                ? { ...item, quantity: item.quantity + 1 }
                : item,
            );
          }
          return [...current, { slug, name, unitPrice, quantity: 1 }];
        });
      },
      removeItem: (slug) => {
        setItems((current) => current.filter((item) => item.slug !== slug));
      },
    }),
    [items],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
