'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';
import type { PayoutRequestAction } from '@/lib/payouts';

const DECISIONS: Record<
  Exclude<PayoutRequestAction, 'resolve'>,
  { label: string; variant: 'default' | 'outline' }
> = {
  approve: { label: 'Approve', variant: 'default' },
  reject: { label: 'Reject', variant: 'outline' },
  retry: { label: 'Send again', variant: 'default' },
};

/**
 * Approve or reject a new request, or queue a failed one again. The reason
 * is optional except on a rejection, where the seller is shown it.
 */
export function PayoutReviewForm({
  decisions,
  idempotencyKey,
  action,
}: {
  decisions: Exclude<PayoutRequestAction, 'resolve'>[];
  idempotencyKey: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="space-y-1.5">
        <Label htmlFor="payout-reason">Reason</Label>
        <Textarea
          id="payout-reason"
          name="reason"
          rows={2}
          maxLength={500}
          placeholder={
            decisions.includes('reject')
              ? 'Required to reject; shown to the seller.'
              : 'Optional note for the audit trail.'
          }
          aria-invalid={state.fieldErrors?.reason ? true : undefined}
        />
        <FieldError messages={state.fieldErrors?.reason} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {decisions.map((decision) => (
          <SubmitButton
            key={decision}
            name="decision"
            value={decision}
            variant={DECISIONS[decision].variant}
            pendingLabel="Submitting…"
          >
            {DECISIONS[decision].label}
          </SubmitButton>
        ))}
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-xs" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
      <FieldError messages={state.fieldErrors?.version} />
      <FormError state={state} />
    </form>
  );
}
