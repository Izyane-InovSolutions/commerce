'use client';

import { useActionState } from 'react';

import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Says that the items added before signing in did not make it into the
 * account's cart — rather than letting them silently not be there — and
 * offers to try the merge again or let it go.
 */
export function CartMergeNotice({
  retry,
  dismiss,
}: {
  retry: () => Promise<FormState>;
  dismiss: () => Promise<void>;
}) {
  const [state, retryAction] = useActionState(
    async (_state: FormState) => retry(),
    idleFormState,
  );

  return (
    <div
      role="status"
      className="space-y-3 rounded-2xl border border-dashed px-4 py-3 text-sm"
    >
      <div>
        <p className="font-medium">
          We couldn&apos;t add your earlier items to this cart
        </p>
        <p className="text-muted-foreground text-pretty">
          What you added before signing in is still saved. Try bringing it
          over again, or dismiss this to leave it behind.
        </p>
      </div>
      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-destructive text-xs">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <form action={retryAction}>
          <SubmitButton size="sm" pendingLabel="Trying…">
            Try again
          </SubmitButton>
        </form>
        <form action={dismiss}>
          <Button type="submit" size="sm" variant="ghost">
            Dismiss
          </Button>
        </form>
      </div>
    </div>
  );
}
