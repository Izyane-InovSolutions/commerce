'use client';

import { useActionState, useState } from 'react';

import { FormError } from '@/components/form-error';
import { SelectField, type SelectOption } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type ProposalReviewProps = {
  axis: 'brand' | 'category';
  /** The name the seller typed. */
  proposed: string;
  /** Existing entries, to map the proposal onto instead. */
  existing: SelectOption[];
  /** Parent choices, for a category. */
  parents?: SelectOption[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

/**
 * Settles one proposed brand or category.
 *
 * "Use an existing one" comes first because it is the common case — a seller
 * writing "Northwind Furniture" when the catalog already has "Northwind" —
 * and taking it stops the taxonomy filling up with near-duplicates.
 */
export function ProposalReview({
  axis,
  proposed,
  existing,
  parents,
  action,
}: ProposalReviewProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [slug, setSlug] = useState(() => toSlug(proposed));

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">
          The seller asked for a {axis} that does not exist:{' '}
          <span className="font-semibold">“{proposed}”</span>
        </p>
        <p className="text-muted-foreground text-sm">
          This has to be settled before the product can be approved.
        </p>
      </div>

      <FormError state={state} />

      <form action={formAction} className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor={`existing-${axis}`}>
              Map onto an existing {axis}
            </Label>
            <SelectField
              id={`existing-${axis}`}
              name="existingId"
              className="w-full"
              placeholder={`Choose a ${axis}`}
              options={existing}
            />
          </div>
          <SubmitButton name="action" value="attach" variant="secondary">
            Use this one
          </SubmitButton>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor={`name-${axis}`}>Or add it as a new {axis}</Label>
            <Input
              id={`name-${axis}`}
              name="name"
              defaultValue={proposed}
              onChange={(event) => setSlug(toSlug(event.target.value))}
            />
          </div>
          <div className="min-w-36 space-y-1.5">
            <Label htmlFor={`slug-${axis}`}>Slug</Label>
            <Input
              id={`slug-${axis}`}
              name="slug"
              className="font-mono text-xs"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
          </div>
          {parents ? (
            <div className="min-w-36 space-y-1.5">
              <Label htmlFor={`parent-${axis}`}>Parent</Label>
              <SelectField
                id={`parent-${axis}`}
                name="parentId"
                className="w-full"
                placeholder="Top level"
                options={parents}
              />
            </div>
          ) : null}
          <SubmitButton name="action" value="create">
            Create and attach
          </SubmitButton>
        </div>

        <div className="border-t pt-3">
          <Button
            type="submit"
            name="action"
            value="dismiss"
            variant="ghost"
            size="sm"
          >
            Publish without a {axis}
          </Button>
        </div>
      </form>
    </div>
  );
}
