import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PackageSearch } from 'lucide-react';

import { BackButton } from '@/components/back-button';
import { ProductCard } from '@/components/product-card';
import { ProductDetailActions } from '@/components/product-detail-actions';
import { getProductBySlug, listProducts } from '@/lib/catalog';
import { getDisplayPrice } from '@/lib/catalog-types';
import { formatCurrency } from '@/lib/currency';

type ProductDetailPageProps = PageProps<'/products/[slug]'>;

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  return { title: product?.name ?? 'Product' };
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const price = getDisplayPrice(product);
  const relatedProducts = product.category
    ? (
        await listProducts({
          categorySlug: product.category.slug,
          limit: 5,
        })
      ).products
        .filter((candidate) => candidate.slug !== product.slug)
        .slice(0, 4)
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-12">
      <BackButton />

      <div className="grid gap-8 sm:grid-cols-2">
        <div className="flex aspect-square items-center justify-center rounded-2xl bg-muted">
          <PackageSearch
            className="size-16 text-muted-foreground"
            aria-hidden="true"
          />
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            {product.category ? (
              <p className="text-sm text-muted-foreground">
                {product.category.name}
              </p>
            ) : null}
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {product.name}
            </h1>
          </div>

          <p className="text-2xl font-semibold">
            {price !== null ? formatCurrency(price) : 'Currently unavailable'}
          </p>

          {product.description ? (
            <p className="text-muted-foreground text-pretty">
              {product.description}
            </p>
          ) : null}

          <ProductDetailActions
            slug={product.slug}
            name={product.name}
            unitPrice={price}
          />
        </div>
      </div>

      {relatedProducts.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Similar products
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard key={relatedProduct.id} product={relatedProduct} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
