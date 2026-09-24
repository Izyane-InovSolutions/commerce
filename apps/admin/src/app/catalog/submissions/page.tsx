import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { backendListPendingProductSubmissions } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { ProductSubmissionReviewForm } from '@/components/product-submission-review-form';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

import { reviewSubmissionAction } from '../actions';

export const metadata: Metadata = { title: 'Product submissions' };

const TITLE = 'Product submissions';
const DESCRIPTION =
  "Brand-new products sellers submitted themselves, waiting on a decision. Approving publishes the product and every variant on it — there's no separate publish step after.";

export default async function ProductSubmissionsPage() {
  await requireAdmin();

  let products;
  try {
    products = await backendListPendingProductSubmissions(apiClient);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/catalog">
            <ArrowLeft data-icon="inline-start" />
            Catalog
          </Link>
        </Button>
      </div>

      <PageHeader title={TITLE} description={DESCRIPTION} />

      {products.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          description="No seller-submitted product is currently pending review."
        />
      ) : (
        <div className="space-y-6">
          {products.map((product) => (
            <Card key={product.id}>
              <CardHeader>
                <CardTitle>{product.name}</CardTitle>
                <CardDescription>
                  <span className="font-mono">{product.slug}</span>
                  {product.brand ? ` · ${product.brand.name}` : ''}
                  {product.category ? ` · ${product.category.name}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {product.description ? (
                  <p className="text-muted-foreground text-sm text-pretty">
                    {product.description}
                  </p>
                ) : null}

                <div>
                  <p className="mb-1 text-sm font-medium">Variants</p>
                  <ul className="text-muted-foreground space-y-1 text-sm">
                    {product.variants.map((variant) => (
                      <li key={variant.id} className="flex justify-between gap-3">
                        <span>{variant.name ?? 'Default variant'}</span>
                        <span className="font-mono text-xs">
                          {variant.skuCode}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {product.media.length > 0 ? (
                  <div>
                    <p className="mb-1 text-sm font-medium">Photos</p>
                    <div className="flex flex-wrap gap-3">
                      {product.media.map((media) =>
                        media.url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived admin URL isn't worth Next's image pipeline here.
                          <img
                            key={media.id}
                            src={media.url}
                            alt=""
                            className="size-20 rounded-lg border object-cover"
                          />
                        ) : null,
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="border-t pt-4">
                  <ProductSubmissionReviewForm
                    action={reviewSubmissionAction.bind(null, product.id)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
