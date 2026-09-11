export type Product = {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  description: string;
};

export type ProductCategory = {
  slug: string;
  title: string;
  products: Product[];
};

/**
 * Placeholder catalog data for the homepage category sections. Replace with
 * a real fetch against the catalog module (GET /api/v1/products) once it
 * ships in Phase 1.
 */
export const productCategories: ProductCategory[] = [
  {
    slug: 'new-arrivals',
    title: 'New Arrivals',
    products: [
      {
        id: 'na-1',
        name: 'Aria Wireless Earbuds',
        price: 79,
        description:
          'True wireless earbuds with active noise cancellation and 30 hours of combined battery life.',
      },
      {
        id: 'na-2',
        name: 'Lumen Desk Lamp',
        price: 45,
        description:
          'Adjustable LED desk lamp with warm-to-cool color temperature and a built-in USB charging port.',
      },
      {
        id: 'na-3',
        name: 'Nomad Travel Backpack',
        price: 129,
        description:
          'A weatherproof 30L backpack with a padded laptop sleeve and a dedicated shoe compartment.',
      },
      {
        id: 'na-4',
        name: 'Cascade Water Bottle',
        price: 28,
        description:
          'Insulated stainless steel bottle that keeps drinks cold for 24 hours or hot for 12.',
      },
      {
        id: 'na-5',
        name: 'Pulse Fitness Tracker',
        price: 99,
        description:
          'Tracks heart rate, sleep, and workouts, with a 7-day battery and a bright always-on display.',
      },
      {
        id: 'na-6',
        name: 'Drift Bluetooth Speaker',
        price: 59,
        description:
          'A compact, waterproof speaker with 12 hours of playtime and rich, room-filling sound.',
      },
    ],
  },
  {
    slug: 'best-sellers',
    title: 'Best Sellers',
    products: [
      {
        id: 'bs-1',
        name: 'Classic Cotton Tee',
        price: 22,
        description:
          'A soft, breathable 100% cotton t-shirt cut for an everyday, true-to-size fit.',
      },
      {
        id: 'bs-2',
        name: 'Everyday Canvas Tote',
        price: 34,
        description:
          'A durable canvas tote with reinforced handles and an interior pocket for small essentials.',
      },
      {
        id: 'bs-3',
        name: 'Stride Running Shoes',
        price: 89,
        description:
          'Lightweight running shoes with responsive cushioning and a breathable knit upper.',
      },
      {
        id: 'bs-4',
        name: 'Aroma French Press',
        price: 42,
        description:
          'An 8-cup borosilicate glass French press with a stainless steel filter for full-bodied coffee.',
      },
      {
        id: 'bs-5',
        name: 'Glow Skincare Set',
        price: 65,
        description:
          'A three-step routine of cleanser, serum, and moisturizer suited to all skin types.',
      },
      {
        id: 'bs-6',
        name: 'Comfort Memory Pillow',
        price: 38,
        description:
          'A contoured memory foam pillow that supports the neck and shoulders for side and back sleepers.',
      },
    ],
  },
  {
    slug: 'deals',
    title: 'Deals',
    products: [
      {
        id: 'dl-1',
        name: 'Solstice Sunglasses',
        price: 24,
        compareAtPrice: 40,
        description:
          'Polarized lenses with 100% UV protection in a lightweight, scratch-resistant frame.',
      },
      {
        id: 'dl-2',
        name: 'Voyage Duffel Bag',
        price: 54,
        compareAtPrice: 90,
        description:
          'A rugged weekend duffel with a removable shoulder strap and a separate shoe pocket.',
      },
      {
        id: 'dl-3',
        name: 'Halo Desk Organizer',
        price: 18,
        compareAtPrice: 30,
        description:
          'A modular bamboo organizer that keeps pens, cables, and notes tidy on any desk.',
      },
      {
        id: 'dl-4',
        name: 'Ember Scented Candle',
        price: 12,
        compareAtPrice: 20,
        description:
          'A soy-wax candle with a 45-hour burn time in a warm, woody fragrance.',
      },
      {
        id: 'dl-5',
        name: 'Flux Yoga Mat',
        price: 28,
        compareAtPrice: 45,
        description:
          'A non-slip, extra-thick yoga mat with alignment lines and a carrying strap included.',
      },
      {
        id: 'dl-6',
        name: 'Orbit Phone Stand',
        price: 9,
        compareAtPrice: 15,
        description:
          'An adjustable aluminum stand that folds flat and fits any phone or small tablet.',
      },
    ],
  },
];

export function getProductById(
  id: string,
): (Product & { categoryTitle: string }) | undefined {
  for (const category of productCategories) {
    const product = category.products.find((candidate) => candidate.id === id);
    if (product) {
      return { ...product, categoryTitle: category.title };
    }
  }

  return undefined;
}

export function getRelatedProducts(id: string, limit = 4): Product[] {
  const category = productCategories.find((candidate) =>
    candidate.products.some((product) => product.id === id),
  );

  if (!category) {
    return [];
  }

  return category.products
    .filter((product) => product.id !== id)
    .slice(0, limit);
}
