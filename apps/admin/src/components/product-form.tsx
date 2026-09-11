'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';

import type {
  BackendBrand,
  BackendCategory,
  BackendAdminProduct,
} from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The product record itself.
 *
 * Variants, offers and prices are separate resources in the Commerce API, so
 * they are managed on the product's own page once it exists rather than being
 * folded into one oversized create form.
 */
export function ProductForm({
  action,
  brands,
  categories,
  product,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  brands: BackendBrand[];
  categories: BackendCategory[];
  product?: BackendAdminProduct;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(product !== undefined);

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError state={state} />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            What the item is. Variants and pricing come next.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugEdited) {
                  setSlug(toSlug(event.target.value));
                }
              }}
              aria-invalid={fieldErrors.name !== undefined}
            />
            <FieldError messages={fieldErrors.name} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              required
              className="font-mono"
              value={slug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value);
              }}
              aria-invalid={fieldErrors.slug !== undefined}
            />
            <p className="text-muted-foreground text-xs">
              Used in the storefront URL. Generated from the name until you edit
              it.
            </p>
            <FieldError messages={fieldErrors.slug} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={product?.description ?? ''}
            />
            <FieldError messages={fieldErrors.description} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brandId">Brand</Label>
              <SelectField
                id="brandId"
                name="brandId"
                className="w-full"
                placeholder="No brand"
                defaultValue={product?.brand?.id ?? ''}
                options={brands.map((brand) => ({
                  value: brand.id,
                  label: brand.name,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categoryId">Category</Label>
              <SelectField
                id="categoryId"
                name="categoryId"
                className="w-full"
                placeholder="No category"
                defaultValue={product?.category?.id ?? ''}
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton>
          {product ? 'Save changes' : 'Create product'}
        </SubmitButton>
        <Button variant="ghost" asChild>
          <Link href="/catalog">Cancel</Link>
        </Button>
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-sm" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
