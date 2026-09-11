'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField, type SelectOption } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * The first receipt for a variant.
 *
 * The per-row form on the table below can only move stock that already
 * exists, so a variant with no record yet has nowhere to start. This is that
 * starting point — after the first receipt, the row takes over.
 */
export function ReceiveStockForm({
  warehouses,
  variants,
  action,
}: {
  warehouses: SelectOption[];
  variants: SelectOption[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="receive-warehouse">Warehouse</Label>
          <SelectField
            id="receive-warehouse"
            name="warehouseId"
            className="w-full"
            options={warehouses}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="receive-variant">Variant</Label>
          <SelectField
            id="receive-variant"
            name="variantId"
            className="w-full"
            placeholder="Choose a variant"
            options={variants}
            required
          />
          <FieldError messages={state.fieldErrors?.variantId} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="receive-quantity">Quantity</Label>
          <Input
            id="receive-quantity"
            name="quantity"
            type="number"
            min={1}
            step="1"
            placeholder="0"
            required
            aria-invalid={state.fieldErrors?.quantity ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.quantity} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="receive-note">Note</Label>
          <Input
            id="receive-note"
            name="note"
            placeholder="Optional — appears in the movement log"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Receiving…">Receive stock</SubmitButton>
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-xs" role="status">
            {state.message}
          </span>
        ) : null}
      </div>

      <FormError state={state} />
    </form>
  );
}
