'use client';

import { useActionState } from 'react';

import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Runs a payout batch. Unlike most one-click actions its success message
 * matters — it says how many requests now wait on a manual transfer — so it
 * is shown rather than left to the re-render.
 */
export function PayoutBatchButton({
  action,
}: {
  action: () => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(
    async () => action(),
    idleFormState,
  );

  return (
    <form action={formAction} className="space-y-1.5">
      <SubmitButton pendingLabel="Processing…">Run payout batch</SubmitButton>
      {state.status === 'idle' && state.message ? (
        <p className="text-muted-foreground text-xs" role="status">
          {state.message}
        </p>
      ) : null}
      <FormError state={state} />
    </form>
  );
}
