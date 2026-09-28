import type { Metadata } from 'next';

import { ProductGrid } from '@/components/product-grid';
import { listProducts } from '@/lib/catalog';
import type { Product } from '@/lib/catalog-types';

export const metadata: Metadata = {
  title: 'New Arrivals',
};

export default async function NewArrivalsPage() {
  let products: Product[] = [];
  try {
    ({ products } = await listProducts({ sort: 'createdAt:desc', limit: 24 }));
  } catch {
    products = [];
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New Arrivals</h1>
      <ProductGrid products={products} />
    </div>
  );
}
