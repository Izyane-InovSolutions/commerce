'use client';

import { useActionState, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField, type SelectOption } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Adds a category or a brand.
 *
 * The slug follows the name until someone edits it, because it ends up in a
 * storefront URL and should not be an afterthought.
 */
export function TaxonomyAddForm({
  action,
  label,
  parents,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  /** Parent choices, for a category. Omit for a flat taxonomy like brands. */
  parents?: SelectOption[];
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-3">
      <FormError state={state} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="new-name">{label} name</Label>
          <Input
            id="new-name"
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
        </div>

        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="new-slug">Slug</Label>
          <Input
            id="new-slug"
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
        </div>

        {parents ? (
          <div className="min-w-40 space-y-1.5">
            <Label htmlFor="new-parent">Parent</Label>
            <SelectField
              id="new-parent"
              name="parentId"
              className="w-full"
              placeholder="Top level"
              options={parents}
            />
          </div>
        ) : null}

        <SubmitButton pendingLabel="Adding…">Add {label}</SubmitButton>
      </div>

      <FieldError messages={fieldErrors.name} />
      <FieldError messages={fieldErrors.slug} />
      {state.status === 'idle' && state.message ? (
        <p className="text-muted-foreground text-sm" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
