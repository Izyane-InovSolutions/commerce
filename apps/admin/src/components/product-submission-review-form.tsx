'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

/** The review decision on a seller's product submission — a reason is
 * required either way, approving or rejecting. */
export function ProductSubmissionReviewForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="submission-reason">Reason</Label>
        <Textarea
          id="submission-reason"
          name="reason"
          rows={3}
          required
          minLength={3}
          maxLength={1000}
          placeholder="Recorded against the product and shown to the seller."
          aria-invalid={state.fieldErrors?.reason ? true : undefined}
        />
        <FieldError messages={state.fieldErrors?.reason} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton
          name="decision"
          value="approve"
          variant="default"
          pendingLabel="Submitting…"
        >
          Approve &amp; publish
        </SubmitButton>
        <SubmitButton
          name="decision"
          value="reject"
          variant="outline"
          pendingLabel="Submitting…"
        >
          Reject
        </SubmitButton>
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
