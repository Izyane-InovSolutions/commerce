import type { Metadata } from 'next';

import { listBrands, listCategories } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { ProductForm } from '@/components/product-form';
import { apiClient } from '@/lib/api';

import { createProductAction } from '../actions';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
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
        title="New product"
        description="A product describes what an item is. Add at least one variant so sellers have a SKU to offer against."
      />
      <ProductForm
        action={createProductAction}
        brands={brands}
        categories={categories}
      />
    </div>
  );
}
