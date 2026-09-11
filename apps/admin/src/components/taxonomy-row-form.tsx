'use client';

import { useActionState } from 'react';

import { FormError } from '@/components/form-error';
import { SelectField, type SelectOption } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { idleFormState, type FormState } from '@/lib/form';

type TaxonomyRowFormProps = {
  entry: { id: string; name: string; slug: string; productCount: number };
  save: (state: FormState, formData: FormData) => Promise<FormState>;
  remove: () => Promise<FormState>;
  /** Parent choices, for a category. Omit for a flat taxonomy. */
  parents?: SelectOption[];
  parentId?: string | null;
};

/**
 * Renames or removes one taxonomy entry in place.
 *
 * Removal is only offered when nothing references the entry, so the button is
 * not a trap; the API refuses it either way, and the reason is shown here.
 */
export function TaxonomyRowForm({
  entry,
  save,
  remove,
  parents,
  parentId,
}: TaxonomyRowFormProps) {
  const [saveState, saveAction] = useActionState(save, idleFormState);
  const [removeState, removeAction] = useActionState<FormState>(
    remove,
    idleFormState,
  );

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <form action={saveAction} className="flex flex-wrap items-center gap-2">
          <label htmlFor={`name-${entry.id}`} className="sr-only">
            Name
          </label>
          <Input
            id={`name-${entry.id}`}
            name="name"
            defaultValue={entry.name}
            className="w-44"
          />
          <label htmlFor={`slug-${entry.id}`} className="sr-only">
            Slug
          </label>
          <Input
            id={`slug-${entry.id}`}
            name="slug"
            defaultValue={entry.slug}
            className="w-40 font-mono text-xs"
          />
          {parents ? (
            <>
              <label htmlFor={`parent-${entry.id}`} className="sr-only">
                Parent
              </label>
              <SelectField
                id={`parent-${entry.id}`}
                name="parentId"
                placeholder="Top level"
                defaultValue={parentId ?? ''}
                options={parents.filter((option) => option.value !== entry.id)}
              />
            </>
          ) : null}
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </form>

        {entry.productCount === 0 ? (
          <form action={removeAction}>
            <Button type="submit" variant="ghost" size="sm">
              Remove
            </Button>
          </form>
        ) : (
          <span className="text-muted-foreground text-xs">
            {entry.productCount} in use
          </span>
        )}
      </div>

      <FormError state={saveState} />
      <FormError state={removeState} />
      {saveState.status === 'idle' && saveState.message ? (
        <p className="text-muted-foreground text-xs" role="status">
          {saveState.message}
        </p>
      ) : null}
    </div>
  );
}
