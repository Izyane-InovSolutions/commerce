'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Receives or corrects stock on one record.
 *
 * Receiving and adjusting are separate endpoints because they mean different
 * things in the movement log, so the button pressed decides which is called.
 */
export function StockMoveForm({
  warehouseId,
  variantId,
  label,
  action,
}: {
  warehouseId: string;
  variantId: string;
  label: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const inputId = `delta-${warehouseId}-${variantId}`;

  return (
    <form action={formAction} className="space-y-1 text-right">
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <input type="hidden" name="variantId" value={variantId} />

      <div className="flex items-center justify-end gap-2">
        <label htmlFor={inputId} className="sr-only">
          Quantity for {label}
        </label>
        <Input
          id={inputId}
          name="delta"
          type="number"
          step="1"
          placeholder="0"
          className="w-20 text-right"
          aria-invalid={state.fieldErrors?.delta !== undefined}
        />
        <SubmitButton name="mode" value="receive" pendingLabel="Receiving…">
          Receive
        </SubmitButton>
        <SubmitButton
          name="mode"
          value="adjust"
          variant="outline"
          pendingLabel="Adjusting…"
        >
          Adjust
        </SubmitButton>
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
