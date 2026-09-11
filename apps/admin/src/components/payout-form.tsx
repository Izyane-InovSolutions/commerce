'use client';

import { useActionState, useId, useMemo } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Records a payout against one seller.
 *
 * The amount is typed in major units because that is how a transfer is read
 * off a bank statement; the action converts it. The idempotency key is minted
 * once per mounted form, so pressing the button twice — or retrying after a
 * timeout — records one payout rather than two.
 */
export function PayoutForm({
  currency,
  action,
}: {
  currency: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldId = useId();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-amount`}>Amount ({currency})</Label>
          <Input
            id={`${fieldId}-amount`}
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            required
            aria-invalid={state.fieldErrors?.amount ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.amount} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-reference`}>Reference</Label>
          <Input
            id={`${fieldId}-reference`}
            name="reference"
            maxLength={200}
            placeholder="Bank transfer reference"
          />
          <FieldError messages={state.fieldErrors?.reference} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-note`}>Note</Label>
        <Input
          id={`${fieldId}-note`}
          name="note"
          maxLength={500}
          placeholder="Optional"
        />
        <FieldError messages={state.fieldErrors?.note} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Recording…">Record payout</SubmitButton>
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
