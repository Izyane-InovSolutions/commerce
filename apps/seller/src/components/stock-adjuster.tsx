'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Adds to or removes from the seller's own stock for one SKU.
 *
 * Posts a signed change rather than a new total, so two people counting the
 * same shelf add up instead of overwriting each other.
 */
export function StockAdjuster({
  skuId,
  locationId,
  label,
  action,
}: {
  skuId: string;
  locationId: string;
  label: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const inputId = `delta-${skuId}`;

  return (
    <form action={formAction} className="space-y-1 text-right">
      <input type="hidden" name="skuId" value={skuId} />
      <input type="hidden" name="locationId" value={locationId} />

      <div className="flex items-center justify-end gap-2">
        <label htmlFor={inputId} className="sr-only">
          Adjust {label}
        </label>
        <Input
          id={inputId}
          name="delta"
          type="number"
          step="1"
          placeholder="±0"
          className="w-20 text-right"
          aria-invalid={state.fieldErrors?.delta !== undefined}
        />
        <SubmitButton pendingLabel="Saving…">Apply</SubmitButton>
      </div>

      <FieldError messages={state.fieldErrors?.delta} />
      <FormError state={state} />
      {state.status === 'idle' && state.message ? (
        <span className="text-muted-foreground text-xs" role="status">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
