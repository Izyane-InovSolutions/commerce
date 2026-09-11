import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PackageSearch } from 'lucide-react';

import { BackButton } from '@/components/back-button';
import { ProductCard } from '@/components/product-card';
import { ProductDetailActions } from '@/components/product-detail-actions';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';
import { getProductById, getRelatedProducts } from '@/lib/mock-data/products';

type ProductDetailPageProps = PageProps<'/products/[id]'>;

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = getProductById(id);

  return { title: product?.name ?? 'Product' };
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { id } = await params;
  const product = getProductById(id);

  if (!product) {
    notFound();
  }

  const onSale = typeof product.compareAtPrice === 'number';
  const discountPercent = product.compareAtPrice
    ? Math.round((1 - product.price / product.compareAtPrice) * 100)
    : 0;
  const relatedProducts = getRelatedProducts(product.id);

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
            <p className="text-sm text-muted-foreground">
              {product.categoryTitle}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {product.name}
            </h1>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold">
              {formatCurrency(product.price)}
            </span>
            {onSale ? (
              <>
                <span className="text-muted-foreground line-through">
                  {formatCurrency(product.compareAtPrice as number)}
                </span>
                <Badge variant="destructive">Save {discountPercent}%</Badge>
              </>
            ) : null}
          </div>

          <p className="text-muted-foreground text-pretty">
            {product.description}
          </p>

          <ProductDetailActions
            productId={product.id}
            productName={product.name}
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
