'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Sets one stock record's reorder point — the available level at which the
 * record is flagged for restocking. Zero means no flag.
 */
export function InventoryReorderForm({
  reorderPoint,
  action,
}: {
  reorderPoint: number;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-1.5">
      <Label htmlFor="reorder-point">Reorder point</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="reorder-point"
          name="reorderPoint"
          type="number"
          min={0}
          step={1}
          defaultValue={reorderPoint}
          className="w-28 text-right"
          aria-invalid={state.fieldErrors?.reorderPoint ? true : undefined}
        />
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save
        </SubmitButton>
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-xs" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
      <FieldError messages={state.fieldErrors?.reorderPoint} />
      <FormError state={state} />
    </form>
  );
}
