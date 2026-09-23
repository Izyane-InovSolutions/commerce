'use client';

import { useActionState, useState, type ChangeEvent } from 'react';

import type { BackendBrand, BackendCategory } from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';
import type { UploadImageResult, UploadedImage } from '@/app/products/submit/actions';

/**
 * A brand-new catalog product — name, description, brand/category, an
 * opening variant (SKU), and photos — held for admin review once submitted.
 *
 * Photos upload immediately, one at a time, ahead of the form itself, same
 * as the seller application's own verification documents: the submit
 * endpoint takes their ids directly rather than a file, and there's nowhere
 * to attach one before the product it belongs to exists.
 */
export function SubmitProductForm({
  brands,
  categories,
  submit,
  uploadImage,
}: {
  brands: BackendBrand[];
  categories: BackendCategory[];
  submit: (state: FormState, formData: FormData) => Promise<FormState>;
  uploadImage: (formData: FormData) => Promise<UploadImageResult>;
}) {
  const [state, formAction] = useActionState(submit, idleFormState);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    const body = new FormData();
    body.append('file', file);
    const result = await uploadImage(body);

    setUploading(false);

    if (result.status === 'error') {
      setUploadError(result.message);
      return;
    }

    setImages((current) => [...current, result.image]);
  }

  function removeImage(id: string): void {
    setImages((current) => current.filter((image) => image.id !== id));
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="submit-name">Product name</Label>
          <Input
            id="submit-name"
            name="name"
            minLength={1}
            required
            aria-invalid={state.fieldErrors?.name ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.name} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="submit-slug">Slug</Label>
          <Input
            id="submit-slug"
            name="slug"
            placeholder="e.g. comfort-memory-pillow"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
            aria-invalid={state.fieldErrors?.slug ? true : undefined}
          />
          <p className="text-muted-foreground text-xs">
            Lowercase letters, numbers, and single hyphens.
          </p>
          <FieldError messages={state.fieldErrors?.slug} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="submit-description">Description</Label>
          <Textarea id="submit-description" name="description" rows={4} />
          <FieldError messages={state.fieldErrors?.description} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="submit-brand">Brand</Label>
          <SelectField
            id="submit-brand"
            name="brandId"
            placeholder="No brand"
            options={brands.map((brand) => ({ value: brand.id, label: brand.name }))}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="submit-category">Category</Label>
          <SelectField
            id="submit-category"
            name="categoryId"
            placeholder="No category"
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="submit-returnable"
            name="isReturnable"
            type="checkbox"
            defaultChecked
            className="size-4 rounded border-input"
          />
          <Label htmlFor="submit-returnable" className="font-normal">
            Returnable
          </Label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="submit-return-window">Return window (days)</Label>
          <Input
            id="submit-return-window"
            name="returnWindowDays"
            type="number"
            min={0}
            placeholder="Platform default"
          />
          <FieldError messages={state.fieldErrors?.returnWindowDays} />
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        <p className="text-sm font-medium">Opening variant</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="submit-sku">SKU</Label>
            <Input
              id="submit-sku"
              name="skuCode"
              minLength={1}
              required
              aria-invalid={state.fieldErrors?.skuCode ? true : undefined}
            />
            <FieldError messages={state.fieldErrors?.skuCode} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="submit-variant-name">Variant name</Label>
            <Input id="submit-variant-name" name="variantName" placeholder="Optional" />
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="submit-image">Photos</Label>
        <Input
          id="submit-image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          disabled={uploading}
          className="file:text-foreground file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
        />
        <p className="text-muted-foreground text-xs text-pretty">
          JPEG, PNG, or WebP, up to 10MB each. The first photo is the primary
          image.
        </p>

        {uploading ? (
          <p className="text-muted-foreground text-xs" role="status">
            Uploading…
          </p>
        ) : null}
        {uploadError ? (
          <p className="text-destructive text-sm" role="alert">
            {uploadError}
          </p>
        ) : null}

        {images.length > 0 ? (
          <ul className="space-y-1.5">
            {images.map((image, index) => (
              <li
                key={image.id}
                className="bg-muted/40 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm"
              >
                <span className="truncate">
                  {image.fileName}
                  {index === 0 ? ' (primary)' : ''}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeImage(image.id)}
                >
                  Remove
                </Button>
                <input type="hidden" name="mediaAssetIds" value={image.id} />
              </li>
            ))}
          </ul>
        ) : null}

        <FieldError messages={state.fieldErrors?.mediaAssetIds} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Submitting…">
          Submit for review
        </SubmitButton>
      </div>

      <FormError state={state} />
    </form>
  );
}
