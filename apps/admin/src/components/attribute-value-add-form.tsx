'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Adds a value to one attribute. React resets an action form once it
 * settles, so the field is empty again for the next value in a run.
 */
export function AttributeValueAddForm({
  attributeId,
  attributeName,
  action,
}: {
  attributeId: string;
  attributeName: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`new-value-${attributeId}`} className="sr-only">
          New value for {attributeName}
        </label>
        <Input
          id={`new-value-${attributeId}`}
          name="value"
          required
          placeholder="New value"
          className="w-44"
          aria-invalid={state.fieldErrors?.value ? true : undefined}
        />
        <SubmitButton variant="outline" pendingLabel="Adding…">
          Add value
        </SubmitButton>
      </div>
      <FieldError messages={state.fieldErrors?.value} />
      <FormError state={state} />
    </form>
  );
}
