'use client';

import { useActionState, useId } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function Outcome({ state }: { state: FormState }) {
  return (
    <>
      {state.status === 'idle' && state.message ? (
        <p className="text-muted-foreground text-sm" role="status">
          {state.message}
        </p>
      ) : null}
      <FormError state={state} />
    </>
  );
}

/**
 * Refunds a seller order or a payment by id.
 *
 * With `targetId` the form is for one known record and carries its id
 * hidden; without it, the id is pasted in. The amount is typed in major units
 * of the order's currency and converted by the action. The idempotency key is bound into `action` by the page, not
 * minted here, so a retry after an error replays it and only a successful
 * refund — which re-renders the page — moves on to a new one.
 */
export function RefundForm({
  action,
  targetId,
  targetLabel = 'Id',
  targetHint,
  amountHint = 'In the order’s own currency.',
  submitLabel,
}: {
  action: Action;
  targetId?: string;
  targetLabel?: string;
  targetHint?: string;
  amountHint?: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldId = useId();

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {targetId ? (
          <input type="hidden" name="targetId" value={targetId} />
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-target`}>{targetLabel}</Label>
            <Input
              id={`${fieldId}-target`}
              name="targetId"
              required
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-describedby={`${fieldId}-target-hint`}
              aria-invalid={state.fieldErrors?.targetId ? true : undefined}
            />
            <p
              id={`${fieldId}-target-hint`}
              className="text-muted-foreground text-xs"
            >
              {targetHint}
            </p>
            <FieldError messages={state.fieldErrors?.targetId} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-amount`}>Amount</Label>
          <Input
            id={`${fieldId}-amount`}
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            required
            aria-describedby={`${fieldId}-amount-hint`}
            aria-invalid={state.fieldErrors?.amount ? true : undefined}
          />
          <p
            id={`${fieldId}-amount-hint`}
            className="text-muted-foreground text-xs"
          >
            {amountHint}
          </p>
          <FieldError messages={state.fieldErrors?.amount} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-reason`}>Reason</Label>
        <Textarea
          id={`${fieldId}-reason`}
          name="reason"
          required
          minLength={3}
          maxLength={500}
          rows={2}
          aria-invalid={state.fieldErrors?.reason ? true : undefined}
        />
        <FieldError messages={state.fieldErrors?.reason} />
      </div>

      <SubmitButton pendingLabel="Refunding…">{submitLabel}</SubmitButton>
      <Outcome state={state} />
    </form>
  );
}

/** Re-asks the provider about one refund attempt. */
export function ReconcileRefundForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldId = useId();

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-refund`}>Refund attempt id</Label>
        <Input
          id={`${fieldId}-refund`}
          name="refundId"
          required
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          aria-invalid={state.fieldErrors?.refundId ? true : undefined}
        />
        <FieldError messages={state.fieldErrors?.refundId} />
      </div>

      <SubmitButton pendingLabel="Checking…" variant="secondary">
        Reconcile
      </SubmitButton>
      <Outcome state={state} />
    </form>
  );
}
