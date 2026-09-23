import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import {
  backendListPublicBrands,
  backendListPublicCategories,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { SellerGateNotice } from '@/components/seller-gate-notice';
import { SubmitProductForm } from '@/components/submit-product-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

import { submitProductAction, uploadProductImageAction } from './actions';

export const metadata: Metadata = { title: 'Submit a product' };

const TITLE = 'Submit a product';
const DESCRIPTION =
  "A brand-new catalog product — not one that already exists. An administrator reviews it before it's published and you can list against it.";

export default async function SubmitProductPage() {
  await requireUser();
  const account = await getSellerAccount();

  if (account.state !== 'approved') {
    return (
      <SellerGateNotice title={TITLE} description={DESCRIPTION} account={account} />
    );
  }

  let brands;
  let categories;
  try {
    [brands, categories] = await Promise.all([
      backendListPublicBrands(apiClient),
      backendListPublicCategories(apiClient),
    ]);
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
          <Link href="/products/new">
            <ArrowLeft data-icon="inline-start" />
            List an existing product instead
          </Link>
        </Button>
      </div>

      <PageHeader title={TITLE} description={DESCRIPTION} />

      <Card className="max-w-3xl">
        <CardContent>
          <SubmitProductForm
            brands={brands}
            categories={categories}
            submit={submitProductAction}
            uploadImage={uploadProductImageAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
