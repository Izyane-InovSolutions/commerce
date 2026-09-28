'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Verify or reject a payout destination. Payouts only go to verified
 * accounts, so this is the check that the number or bank account really is
 * the seller's; a rejection's note tells the seller what to correct.
 */
export function PayoutAccountVerifyForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="account-note">Note</Label>
        <Textarea
          id="account-note"
          name="note"
          rows={2}
          maxLength={500}
          placeholder="What you checked it against. Required to reject."
          aria-invalid={state.fieldErrors?.note ? true : undefined}
        />
        <FieldError messages={state.fieldErrors?.note} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton name="decision" value="VERIFIED" pendingLabel="Saving…">
          Verify
        </SubmitButton>
        <SubmitButton
          name="decision"
          value="REJECTED"
          variant="outline"
          pendingLabel="Saving…"
        >
          Reject
        </SubmitButton>
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
