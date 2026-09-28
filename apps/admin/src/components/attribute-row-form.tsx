'use client';

import { useActionState } from 'react';

import { DeleteControl } from '@/components/delete-control';
import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Renames or recodes one attribute, with its delete behind a confirmation.
 *
 * The API does not refuse deleting an attribute in use — it takes the values
 * and strips them from every variant — so the confirmation names how many
 * values are about to go.
 */
export function AttributeRowForm({
  attribute,
  valueCount,
  save,
  remove,
}: {
  attribute: { id: string; name: string; code: string };
  valueCount: number;
  save: (state: FormState, formData: FormData) => Promise<FormState>;
  remove: () => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(save, idleFormState);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <form action={formAction} className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`attribute-name-${attribute.id}`} className="sr-only">
            Name
          </label>
          <Input
            id={`attribute-name-${attribute.id}`}
            name="name"
            required
            defaultValue={attribute.name}
            className="w-44"
            aria-invalid={state.fieldErrors?.name ? true : undefined}
          />
          <label htmlFor={`attribute-code-${attribute.id}`} className="sr-only">
            Code
          </label>
          <Input
            id={`attribute-code-${attribute.id}`}
            name="code"
            required
            defaultValue={attribute.code}
            className="w-40 font-mono text-xs"
            aria-invalid={state.fieldErrors?.code ? true : undefined}
          />
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
        <FieldError messages={state.fieldErrors?.name} />
        <FieldError messages={state.fieldErrors?.code} />
        <FormError state={state} />
        {state.status === 'idle' && state.message ? (
          <p className="text-muted-foreground text-xs" role="status">
            {state.message}
          </p>
        ) : null}
      </form>

      <DeleteControl
        action={remove}
        label="Delete attribute"
        confirmLabel={
          valueCount === 0
            ? `“${attribute.name}”`
            : `“${attribute.name}” and its ${valueCount} ${valueCount === 1 ? 'value' : 'values'}, removing them from every variant,`
        }
      />
    </div>
  );
}
