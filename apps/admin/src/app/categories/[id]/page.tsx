import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  backendGetCategoryAttributes,
  backendListAttributes,
  backendListCategories,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { CategoryAttributesForm } from '@/components/category-attributes-form';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { explainMissingRoute } from '@/lib/api-route-errors';
import { requireAdmin } from '@/lib/session';

import { setCategoryAttributesAction } from '../actions';

export const metadata: Metadata = { title: 'Category attributes' };

export default async function CategoryAttributesPage({
  params,
}: PageProps<'/categories/[id]'>) {
  await requireAdmin();
  const { id } = await params;

  let categories;
  let attributes;
  let effective;
  try {
    [categories, attributes, effective] = await Promise.all([
      backendListCategories(apiClient),
      backendListAttributes(apiClient),
      backendGetCategoryAttributes(apiClient, id),
    ]);
  } catch (error) {
    return (
      <ApiErrorNotice
        error={explainMissingRoute(error, 'category attributes')}
      />
    );
  }

  const category = categories.find((entry) => entry.id === id);
  if (!category) {
    notFound();
  }

  const own = effective.filter((entry) => entry.inheritedFrom === null);
  const inheritedOnly = effective.filter((entry) => entry.inheritedFrom);
  // Offering an inherited attribute in "attach" is how a branch overrides
  // it, so the form labels those with where they come from.
  const inheritedFrom: Record<string, string> = {};
  for (const entry of inheritedOnly) {
    inheritedFrom[entry.attributeId] = entry.inheritedFrom!.name;
  }

  return (
    <div className="space-y-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/categories">
          <ArrowLeft /> Categories
        </Link>
      </Button>
      <PageHeader
        title={`${category.name} attributes`}
        description="What products in this category are described by. Variants may only use these attributes — one value each — and must have every required one. Sub-categories inherit them."
      />

      <Card>
        <CardHeader>
          <CardTitle>Inherited</CardTitle>
          <CardDescription>
            Set on a parent category. Attach one here to make it required or
            optional differently for this branch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inheritedOnly.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {category.parentId
                ? 'The parent categories attach nothing.'
                : 'A top-level category has nothing to inherit.'}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {inheritedOnly.map((entry) => (
                <li
                  key={entry.attributeId}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{entry.name}</span>
                  <span className="text-muted-foreground">
                    {entry.isRequired ? 'Required' : 'Optional'} · from{' '}
                    <Link
                      href={`/categories/${entry.inheritedFrom!.id}`}
                      className="underline underline-offset-4"
                    >
                      {entry.inheritedFrom!.name}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attached to {category.name}</CardTitle>
          <CardDescription>
            Order here is the order shoppers and sellers see the options in.
            Changes apply to variants created or edited from now on; existing
            variants aren&apos;t re-checked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryAttributesForm
            action={setCategoryAttributesAction.bind(null, category.id)}
            initial={own.map((entry) => ({
              attributeId: entry.attributeId,
              name: entry.name,
              isRequired: entry.isRequired,
            }))}
            attributes={attributes.map((attribute) => ({
              id: attribute.id,
              name: attribute.name,
            }))}
            inherited={inheritedFrom}
          />
          {attributes.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              No attributes exist yet.{' '}
              <Link
                href="/catalog/attributes"
                className="underline underline-offset-4"
              >
                Create them first
              </Link>
              .
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
