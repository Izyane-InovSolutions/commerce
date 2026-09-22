'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Reject and cancel both take nothing but a reason — the quantity is
 * whatever is left to reject/cancel, computed server-side from the
 * fulfillment order's own lines rather than asked for here.
 */
export function ReasonActionForm({
  action,
  submitLabel,
  pendingLabel,
  placeholder,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  placeholder?: string;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-1.5">
      <Textarea
        name="reason"
        placeholder={placeholder ?? 'Reason'}
        rows={2}
        aria-invalid={state.fieldErrors?.reason !== undefined}
        className="text-sm"
      />
      <FieldError messages={state.fieldErrors?.reason} />
      <SubmitButton variant="outline" pendingLabel={pendingLabel ?? 'Saving…'}>
        {submitLabel}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
