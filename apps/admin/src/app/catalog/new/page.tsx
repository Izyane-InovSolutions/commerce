import type { Metadata } from 'next';

import { backendListBrands, backendListCategories } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { ProductForm } from '@/components/product-form';
import { apiClient } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

import { createProductAction } from '../actions';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  await requireAdmin();

  let brands;
  let categories;
  try {
    [brands, categories] = await Promise.all([
      backendListBrands(apiClient),
      backendListCategories(apiClient),
    ]);
  } catch (error) {
    return <ApiErrorNotice error={error} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New product"
        description="Create the product record. You add its variants and pricing on the next screen."
      />
      <ProductForm
        action={createProductAction}
        brands={brands}
        categories={categories}
      />
    </div>
  );
}
