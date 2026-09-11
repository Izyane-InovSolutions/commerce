import type { Metadata } from 'next';

import { backendListCategories } from '@commerce/api-client';

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
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from './actions';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  await requireAdmin();

  let categories;
  try {
    categories = await backendListCategories(apiClient);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Categories"
          description="How the catalog is organised."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const options = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Categories"
        description="The category tree is shared by every seller, so it is curated here rather than extended by whoever is listing a product. An entry cannot be removed while sub-categories or products still reference it."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a category</CardTitle>
          <CardDescription>
            Leave the parent empty for a top-level category.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyAddForm
            action={createCategoryAction}
            label="category"
            parents={options}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{categories.length} categories</CardTitle>
          <CardDescription>
            Rename, re-parent, or remove an entry. Sub-categories are shown
            beneath their parent.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {categories.map((category) => (
            <div
              key={category.id}
              className={
                category.parentId
                  ? 'border-muted ml-6 border-l py-3 pl-4'
                  : 'py-3'
              }
            >
              {category.parentId ? (
                <p className="text-muted-foreground mb-1 text-xs">
                  in {nameOf.get(category.parentId) ?? 'unknown'}
                </p>
              ) : null}
              <TaxonomyRowForm
                entry={category}
                parentId={category.parentId}
                parents={options}
                save={updateCategoryAction.bind(null, category.id)}
                remove={deleteCategoryAction.bind(null, category.id)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
