'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * The reconcile step. The manual provider never moves money, so this is
 * where the payout actually completes: after making the transfer by bank or
 * mobile money, the admin records its reference here and marks it paid — or
 * marks it failed if the transfer did not go through.
 */
export function PayoutResolveForm({
  amountLabel,
  destinationLabel,
  idempotencyKey,
  action,
}: {
  /** e.g. "K1,250.00". */
  amountLabel: string;
  /** e.g. "Airtel Money · ****4821 · Jane Banda". */
  destinationLabel: string;
  idempotencyKey: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
        <li>
          Send <span className="text-foreground font-medium">{amountLabel}</span>{' '}
          to {destinationLabel} from the platform&apos;s own bank or
          mobile-money account.
        </li>
        <li>Enter the reference the bank or network gave you, and mark it paid.</li>
        <li>If the transfer could not be made, mark it failed with the reason.</li>
      </ol>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="payout-reference">Transfer reference</Label>
          <Input
            id="payout-reference"
            name="providerReference"
            maxLength={200}
            placeholder="Required to mark paid"
            aria-invalid={state.fieldErrors?.providerReference ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.providerReference} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payout-note">Note</Label>
          <Input
            id="payout-note"
            name="note"
            maxLength={500}
            placeholder="Required to mark failed"
            aria-invalid={state.fieldErrors?.note ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.note} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton name="outcome" value="SUCCEEDED" pendingLabel="Saving…">
          Mark as paid
        </SubmitButton>
        <SubmitButton
          name="outcome"
          value="FAILED"
          variant="outline"
          pendingLabel="Saving…"
        >
          Mark as failed
        </SubmitButton>
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-xs" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
      <FieldError messages={state.fieldErrors?.outcome} />
      <FormError state={state} />
    </form>
  );
}
