import type { Metadata } from 'next';

import { backendListBrands } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { TaxonomyAddForm } from '@/components/taxonomy-add-form';
import { TaxonomyRowForm } from '@/components/taxonomy-row-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

import {
  createBrandAction,
  deleteBrandAction,
  updateBrandAction,
} from './actions';

export const metadata: Metadata = { title: 'Brands' };

export default async function BrandsPage() {
  await requireAdmin();

  let brands;
  try {
    brands = await backendListBrands(apiClient);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Brands" description="Who makes what." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Brands"
        description="Brands are shared by every seller, so they are curated here. A brand cannot be removed while products still carry it."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a brand</CardTitle>
          <CardDescription>
            The slug appears in storefront URLs and filters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyAddForm action={createBrandAction} label="brand" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{brands.length} brands</CardTitle>
          <CardDescription>Rename or remove an entry.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {brands.map((brand) => (
            <div key={brand.id} className="py-3">
              <TaxonomyRowForm
                entry={brand}
                save={updateBrandAction.bind(null, brand.id)}
                remove={deleteBrandAction.bind(null, brand.id)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
