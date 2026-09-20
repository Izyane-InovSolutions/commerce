'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Sets the absolute on-hand quantity for one self-managed offer.
 *
 * Unlike the admin warehouse form this has no separate receive/adjust
 * modes — a seller's own stock has no warehouse to receive into, so there's
 * only ever "this is how many I have now." `version` travels with the form
 * so a stale submit (another tab, or the seller's own last save) is
 * rejected rather than silently overwritten.
 */
export function SetInventoryForm({
  offerId,
  version,
  label,
  action,
}: {
  offerId: string;
  version: number;
  label: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const inputId = `quantity-${offerId}`;

  return (
    <form action={formAction} className="space-y-1 text-right">
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="version" value={version} />

      <div className="flex items-center justify-end gap-2">
        <label htmlFor={inputId} className="sr-only">
          On-hand quantity for {label}
        </label>
        <Input
          id={inputId}
          name="quantity"
          type="number"
          step="1"
          min="0"
          placeholder="0"
          className="w-20 text-right"
          aria-invalid={state.fieldErrors?.quantity !== undefined}
        />
        <SubmitButton pendingLabel="Saving…">Set stock</SubmitButton>
      </div>

      <FieldError messages={state.fieldErrors?.quantity} />
      <FormError state={state} />
      {state.status === 'idle' && state.message ? (
        <span className="text-muted-foreground text-xs" role="status">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
