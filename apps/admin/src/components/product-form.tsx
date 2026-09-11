'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';

import type { Brand, Category, Product } from '@commerce/contracts';

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

type VariantRow = {
  key: string;
  name: string;
  skuCode: string;
  attributes: string;
};

type ProductFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  brands: Brand[];
  categories: Category[];
  product?: Product;
};

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function attributesToText(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

function initialVariants(product?: Product): VariantRow[] {
  if (!product || product.variants.length === 0) {
    return [{ key: 'variant-0', name: '', skuCode: '', attributes: '' }];
  }

  return product.variants.map((variant, index) => ({
    key: `variant-${index}`,
    name: variant.name,
    skuCode: variant.sku.code,
    attributes: attributesToText(variant.attributes),
  }));
}

export function ProductForm({
  action,
  brands,
  categories,
  product,
}: ProductFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(product !== undefined);
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    initialVariants(product),
  );

  const fieldErrors = state.fieldErrors ?? {};

  function updateVariant(
    key: string,
    field: keyof Omit<VariantRow, 'key'>,
    value: string,
  ): void {
    setVariants((rows) =>
      rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  }

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <FormError state={state} />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            What the item is. Who sells it, and at what price, is an offer.
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

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <SelectField
                id="status"
                name="status"
                className="w-full"
                defaultValue={product?.status ?? 'draft'}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'active', label: 'Active' },
                  { value: 'archived', label: 'Archived' },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brandId">Brand</Label>
              <SelectField
                id="brandId"
                name="brandId"
                className="w-full"
                placeholder="No brand"
                defaultValue={product?.brandId ?? ''}
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
                defaultValue={product?.categoryId ?? ''}
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
          <CardDescription>
            Each variant carries the SKU that offers and stock are tracked
            against.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldError messages={fieldErrors.variants} />

          {variants.map((variant, index) => (
            <fieldset
              key={variant.key}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <legend className="sr-only">Variant {index + 1}</legend>

              <div className="space-y-1.5">
                <Label htmlFor={`${variant.key}-name`}>Name</Label>
                <Input
                  id={`${variant.key}-name`}
                  name="variantName"
                  placeholder="Oak / 140cm"
                  value={variant.name}
                  onChange={(event) =>
                    updateVariant(variant.key, 'name', event.target.value)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${variant.key}-sku`}>SKU code</Label>
                <Input
                  id={`${variant.key}-sku`}
                  name="variantSku"
                  placeholder="MRD-DESK-OAK-140"
                  className="font-mono"
                  value={variant.skuCode}
                  onChange={(event) =>
                    updateVariant(variant.key, 'skuCode', event.target.value)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${variant.key}-attributes`}>Attributes</Label>
                <Input
                  id={`${variant.key}-attributes`}
                  name="variantAttributes"
                  placeholder="finish=Oak, width=140cm"
                  value={variant.attributes}
                  onChange={(event) =>
                    updateVariant(variant.key, 'attributes', event.target.value)
                  }
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove variant ${index + 1}`}
                  disabled={variants.length === 1}
                  onClick={() =>
                    setVariants((rows) =>
                      rows.filter((row) => row.key !== variant.key),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </fieldset>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setVariants((rows) => [
                ...rows,
                {
                  key: `variant-${Date.now()}`,
                  name: '',
                  skuCode: '',
                  attributes: '',
                },
              ])
            }
          >
            <Plus data-icon="inline-start" />
            Add variant
          </Button>
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
