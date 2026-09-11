import type { Metadata } from 'next';

import { listBrands, listCategories } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { ProductForm } from '@/components/product-form';
import { apiClient } from '@/lib/api';
import { requireSeller } from '@/lib/session';

import { createProductAction } from '../actions';

export const metadata: Metadata = { title: 'Add Product' };

export default async function NewProductPage() {
  await requireSeller();

  let brands;
  let categories;
  try {
    [brands, categories] = await Promise.all([
      listBrands(apiClient),
      listCategories(apiClient),
    ]);
  } catch (error) {
    return <ApiErrorNotice error={error} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Product"
        description="Propose a product for the shared catalog. An administrator reviews it before shoppers can see it. Save it as a draft if you are not ready."
      />
      <ProductForm
        action={createProductAction}
        brands={brands}
        categories={categories}
      />
    </div>
  );
}
