import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ApiError, backendGetSellerProduct } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { SellerGateNotice } from '@/components/seller-gate-notice';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

export async function generateMetadata({
  params,
}: PageProps<'/products/submissions/[id]'>): Promise<Metadata> {
  const { id } = await params;
  return { title: `Submission ${id.slice(0, 8)}` };
}

export default async function ProductSubmissionPage({
  params,
}: PageProps<'/products/submissions/[id]'>) {
  await requireUser();
  const account = await getSellerAccount();
  const { id } = await params;

  if (account.state !== 'approved') {
    return (
      <SellerGateNotice
        title="Submission"
        description="A brand-new product you submitted."
        account={account}
      />
    );
  }

  let product;
  try {
    product = await backendGetSellerProduct(apiClient, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Submission" description="Items and status." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/products/submissions">
            <ArrowLeft data-icon="inline-start" />
            My submissions
          </Link>
        </Button>
      </div>

      <PageHeader
        title={product.name}
        description={product.description ?? 'No description.'}
        action={
          <div className="flex items-center gap-1.5">
            <StatusBadge status={product.submissionStatus.toLowerCase()} />
            <StatusBadge status={product.status.toLowerCase()} />
          </div>
        }
      />

      {product.submissionStatus === 'REJECTED' && product.reviewReason ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base">Why it wasn&apos;t approved</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm text-pretty">
            {product.reviewReason}
          </CardContent>
        </Card>
      ) : null}

      {product.submissionStatus === 'PENDING' ? (
        <Card>
          <CardContent className="text-muted-foreground text-sm">
            Waiting on an administrator to review this submission.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Slug: <span className="font-mono">{product.slug}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">Brand</dt>
              <dd>{product.brand?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Category</dt>
              <dd>{product.category?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Returnable</dt>
              <dd>{product.isReturnable ? 'Yes' : 'No'}</dd>
            </div>
          </dl>

          <div>
            <p className="mb-2 text-sm font-medium">Variants</p>
            <ul className="space-y-1 text-sm">
              {product.variants.map((variant) => (
                <li
                  key={variant.id}
                  className="text-muted-foreground flex justify-between gap-3"
                >
                  <span>{variant.name ?? 'Default variant'}</span>
                  <span className="font-mono text-xs">{variant.skuCode}</span>
                </li>
              ))}
            </ul>
          </div>

          {product.media.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium">Photos</p>
              <div className="flex flex-wrap gap-3">
                {product.media.map((media) =>
                  media.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived admin/seller URL isn't worth Next's image pipeline here.
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

          {product.submissionStatus === 'APPROVED' ? (
            <Button asChild size="sm">
              <Link href={`/products/new?variantId=${product.variants[0]?.id ?? ''}`}>
                List this for sale
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
