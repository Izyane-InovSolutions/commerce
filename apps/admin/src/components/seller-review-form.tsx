'use client';

import { useActionState } from 'react';

import type { BackendSellerStatus } from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

/** Decisions worth offering, given where the seller already stands. */
function decisionsFor(
  status: BackendSellerStatus,
): { value: string; label: string; variant: 'default' | 'outline' }[] {
  switch (status) {
    case 'PENDING':
      return [
        { value: 'approve', label: 'Approve', variant: 'default' },
        { value: 'reject', label: 'Reject', variant: 'outline' },
      ];
    case 'APPROVED':
      return [{ value: 'suspend', label: 'Suspend', variant: 'outline' }];
    case 'REJECTED':
      return [{ value: 'approve', label: 'Approve', variant: 'default' }];
    case 'SUSPENDED':
      return [{ value: 'approve', label: 'Reinstate', variant: 'default' }];
  }
}

/**
 * The review decision, with the reason the API requires on every one of them
 * — including an approval, where it becomes the note explaining why.
 */
export function SellerReviewForm({
  status,
  version,
  action,
}: {
  status: BackendSellerStatus;
  /** The version this page read; a stale one is refused by the API. */
  version: number;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const decisions = decisionsFor(status);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="version" value={version} />

      <div className="space-y-1.5">
        <Label htmlFor="review-reason">Reason</Label>
        <Textarea
          id="review-reason"
          name="reason"
          rows={3}
          required
          minLength={3}
          maxLength={1000}
          placeholder="Recorded against the seller and shown in the audit trail."
          aria-invalid={state.fieldErrors?.reason ? true : undefined}
        />
        <FieldError messages={state.fieldErrors?.reason} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {decisions.map((decision) => (
          <SubmitButton
            key={decision.value}
            name="decision"
            value={decision.value}
            variant={decision.variant}
            pendingLabel="Submitting…"
          >
            {decision.label}
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
