'use client';

import { useActionState } from 'react';

import type { InventoryLevel } from '@commerce/contracts';
import { inventoryAdjustmentReasons } from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { idleFormState, type FormState } from '@/lib/form';

const REASON_LABELS: Record<string, string> = {
  received: 'Received',
  cycle_count: 'Cycle count',
  damaged: 'Damaged',
  returned: 'Returned',
  correction: 'Correction',
};

/**
 * Adjusts one stock record.
 *
 * The form posts a signed delta rather than a new total, so two people
 * correcting the same SKU at once add up instead of overwriting each other.
 */
export function InventoryAdjustForm({
  level,
  action,
}: {
  level: InventoryLevel;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const inputId = `delta-${level.skuId}-${level.locationId}`;

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="skuId" value={level.skuId} />
      <input type="hidden" name="locationId" value={level.locationId} />

      <div className="flex items-center justify-end gap-2">
        <label htmlFor={inputId} className="sr-only">
          Adjustment for {level.skuCode} at {level.locationName}
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
        <label htmlFor={`reason-${inputId}`} className="sr-only">
          Reason
        </label>
        <SelectField
          id={`reason-${inputId}`}
          name="reason"
          defaultValue="received"
          options={inventoryAdjustmentReasons.map((reason) => ({
            value: reason,
            label: REASON_LABELS[reason] ?? reason,
          }))}
        />
        <SubmitButton pendingLabel="Applying…">Apply</SubmitButton>
      </div>

      <div className="text-right">
        <FieldError messages={state.fieldErrors?.delta} />
        <FormError state={state} />
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-xs" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
