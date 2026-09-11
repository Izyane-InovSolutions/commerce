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

/** Sentinel select value meaning "the catalog does not have mine". */
const PROPOSE = '__propose__';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Proposes a product for the shared catalog, or edits one already proposed.
 *
 * There is deliberately no status field: a submission always goes to review,
 * and the product belongs to the platform once approved. What the seller owns
 * is the offer they then place against its SKU.
 */
function initialVariants(product?: Product): VariantRow[] {
  if (!product || product.variants.length === 0) {
    return [{ key: 'variant-0', name: '', skuCode: '', attributes: '' }];
  }

  return product.variants.map((variant, index) => ({
    key: `variant-${index}`,
    name: variant.name,
    skuCode: variant.sku.code,
    attributes: Object.entries(variant.attributes)
      .map(([key, value]) => `${key}=${value}`)
      .join(', '),
  }));
}

export function ProductForm({
  action,
  brands,
  categories,
  product,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  brands: Brand[];
  categories: Category[];
  product?: Product;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(product !== undefined);
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    initialVariants(product),
  );
  // A seller can name a brand or category the catalog does not have yet. It
  // is recorded on the submission and settled by an admin during review.
  const [brandChoice, setBrandChoice] = useState(() =>
    product?.proposedBrandName ? PROPOSE : (product?.brandId ?? ''),
  );
  const [categoryChoice, setCategoryChoice] = useState(() =>
    product?.proposedCategoryName ? PROPOSE : (product?.categoryId ?? ''),
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
          <CardTitle>Product details</CardTitle>
          <CardDescription>
            Describe the item itself, not your price. Pricing comes next, as an
            offer.
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
            <Label htmlFor="slug">Storefront address</Label>
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
                value={brandChoice}
                onChange={(event) => setBrandChoice(event.target.value)}
                options={[
                  ...brands.map((brand) => ({
                    value: brand.id,
                    label: brand.name,
                  })),
                  { value: PROPOSE, label: 'Not listed — propose a new one' },
                ]}
              />
              {brandChoice === PROPOSE ? (
                <>
                  <Input
                    name="proposedBrandName"
                    placeholder="Brand name"
                    required
                    defaultValue={product?.proposedBrandName ?? ''}
                    aria-label="Proposed brand name"
                    aria-invalid={fieldErrors.proposedBrandName !== undefined}
                  />
                  <p className="text-muted-foreground text-xs">
                    An administrator adds it to the catalog, or maps it to an
                    existing brand, when they review this product.
                  </p>
                  <FieldError messages={fieldErrors.proposedBrandName} />
                </>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categoryId">Category</Label>
              <SelectField
                id="categoryId"
                name="categoryId"
                className="w-full"
                placeholder="No category"
                value={categoryChoice}
                onChange={(event) => setCategoryChoice(event.target.value)}
                options={[
                  ...categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                  { value: PROPOSE, label: 'Not listed — propose a new one' },
                ]}
              />
              {categoryChoice === PROPOSE ? (
                <>
                  <Input
                    name="proposedCategoryName"
                    placeholder="Category name"
                    required
                    defaultValue={product?.proposedCategoryName ?? ''}
                    aria-label="Proposed category name"
                    aria-invalid={
                      fieldErrors.proposedCategoryName !== undefined
                    }
                  />
                  <p className="text-muted-foreground text-xs">
                    An administrator files it in the catalog tree when they
                    review this product.
                  </p>
                  <FieldError messages={fieldErrors.proposedCategoryName} />
                </>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
          <CardDescription>
            Each variant gets a SKU. You place an offer against a SKU once the
            product is approved.
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
                  placeholder="DW-TRAY-BLK"
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
        <SubmitButton pendingLabel="Submitting…">
          Submit for review
        </SubmitButton>
        <Button variant="ghost" asChild>
          <Link href="/listings">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
