'use client';

import { useActionState, useId } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Sets the price a listing sells at.
 *
 * Prices are appended rather than replaced, so this adds a new one that takes
 * effect immediately; the one before it stays in the listing's history.
 */
export function OfferPriceForm({
  version,
  currency,
  action,
}: {
  version: number;
  currency: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldId = useId();

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="version" value={version} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-amount`}>New price</Label>
          <Input
            id={`${fieldId}-amount`}
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            required
            className="w-36"
            aria-invalid={state.fieldErrors?.amount ? true : undefined}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-currency`}>Currency</Label>
          <Input
            id={`${fieldId}-currency`}
            name="currency"
            defaultValue={currency}
            maxLength={3}
            pattern="[A-Za-z]{3}"
            required
            className="w-24"
          />
        </div>

        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Set price
        </SubmitButton>

        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground pb-2 text-xs" role="status">
            {state.message}
          </span>
        ) : null}
      </div>

      <FieldError messages={state.fieldErrors?.amount} />
      <FieldError messages={state.fieldErrors?.currency} />
      <FormError state={state} />
    </form>
  );
}
