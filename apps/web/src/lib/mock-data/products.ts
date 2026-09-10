export type Product = {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number;
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
      { id: 'na-1', name: 'Aria Wireless Earbuds', price: 79 },
      { id: 'na-2', name: 'Lumen Desk Lamp', price: 45 },
      { id: 'na-3', name: 'Nomad Travel Backpack', price: 129 },
      { id: 'na-4', name: 'Cascade Water Bottle', price: 28 },
      { id: 'na-5', name: 'Pulse Fitness Tracker', price: 99 },
      { id: 'na-6', name: 'Drift Bluetooth Speaker', price: 59 },
    ],
  },
  {
    slug: 'best-sellers',
    title: 'Best Sellers',
    products: [
      { id: 'bs-1', name: 'Classic Cotton Tee', price: 22 },
      { id: 'bs-2', name: 'Everyday Canvas Tote', price: 34 },
      { id: 'bs-3', name: 'Stride Running Shoes', price: 89 },
      { id: 'bs-4', name: 'Aroma French Press', price: 42 },
      { id: 'bs-5', name: 'Glow Skincare Set', price: 65 },
      { id: 'bs-6', name: 'Comfort Memory Pillow', price: 38 },
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
      },
      { id: 'dl-2', name: 'Voyage Duffel Bag', price: 54, compareAtPrice: 90 },
      {
        id: 'dl-3',
        name: 'Halo Desk Organizer',
        price: 18,
        compareAtPrice: 30,
      },
      {
        id: 'dl-4',
        name: 'Ember Scented Candle',
        price: 12,
        compareAtPrice: 20,
      },
      { id: 'dl-5', name: 'Flux Yoga Mat', price: 28, compareAtPrice: 45 },
      { id: 'dl-6', name: 'Orbit Phone Stand', price: 9, compareAtPrice: 15 },
    ],
  },
];
