'use client';

import { useActionState } from 'react';

import { DeleteControl } from '@/components/delete-control';
import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Renames or removes one attribute value. A rename shows on every variant
 * carrying the value; a removal takes it off them.
 */
export function AttributeValueRow({
  value,
  save,
  remove,
}: {
  value: { id: string; value: string };
  save: (state: FormState, formData: FormData) => Promise<FormState>;
  remove: () => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(save, idleFormState);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <form action={formAction} className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`attribute-value-${value.id}`} className="sr-only">
            Value
          </label>
          <Input
            id={`attribute-value-${value.id}`}
            name="value"
            required
            defaultValue={value.value}
            className="w-44"
            aria-invalid={state.fieldErrors?.value ? true : undefined}
          />
          <SubmitButton variant="ghost" pendingLabel="Saving…">
            Rename
          </SubmitButton>
        </div>
        <FieldError messages={state.fieldErrors?.value} />
        <FormError state={state} />
      </form>

      <DeleteControl
        action={remove}
        label="Remove"
        confirmLabel={`“${value.value}” from every variant that carries it`}
      />
    </div>
  );
}
