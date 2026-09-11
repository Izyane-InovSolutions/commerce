'use client';

import { useActionState, useState } from 'react';

import type { SellerApplication } from '@commerce/contracts';

import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

type ApplicationReviewProps = {
  application: SellerApplication;
  approve: () => Promise<FormState>;
  reject: (state: FormState, formData: FormData) => Promise<FormState>;
};

/**
 * Approve or reject one application.
 *
 * Rejecting opens a reason field first: the applicant is told why, so the
 * decision cannot be a silent dead end.
 */
export function ApplicationReview({
  application,
  approve,
  reject,
}: ApplicationReviewProps) {
  const [rejecting, setRejecting] = useState(false);
  const [approveState, approveAction] = useActionState<FormState>(
    approve,
    idleFormState,
  );
  const [rejectState, rejectAction] = useActionState(reject, idleFormState);

  if (application.status !== 'pending') {
    return null;
  }

  if (rejecting) {
    return (
      <form action={rejectAction} className="w-full max-w-sm space-y-2">
        <FormError state={rejectState} />
        <Textarea
          name="reason"
          rows={2}
          required
          placeholder={`Why is ${application.displayName} being turned down?`}
          aria-label="Reason for rejection"
        />
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Rejecting…">
            Confirm rejection
          </SubmitButton>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRejecting(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <form action={approveAction}>
          <SubmitButton pendingLabel="Approving…">Approve</SubmitButton>
        </form>
        <Button variant="outline" size="sm" onClick={() => setRejecting(true)}>
          Reject
        </Button>
      </div>
      <FormError state={approveState} />
    </div>
  );
}
