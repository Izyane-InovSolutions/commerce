'use client';

import { useActionState, useState } from 'react';

import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Cancels an unpaid order, asking once before it fires — the same two-click
 * shape as `DeleteControl`, since a cancellation releases the order's stock
 * reservations and can't be undone. The API takes no reason for this one.
 */
export function OrderCancelControl({
  action,
}: {
  action: () => Promise<FormState>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    async () => action(),
    idleFormState,
  );

  return (
    <div className="space-y-1.5">
      {confirming ? (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            Cancel this order and release its stock?
          </span>
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={pending}
          >
            {pending ? 'Cancelling…' : 'Cancel order'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Keep it
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirming(true)}
        >
          Cancel order
        </Button>
      )}
      <FormError state={state} />
    </div>
  );
}
