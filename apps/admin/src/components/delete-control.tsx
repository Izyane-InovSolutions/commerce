'use client';

import { useActionState, useState } from 'react';

import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * A delete that asks once before it fires.
 *
 * The first click only reveals the confirmation, so a stray click on a dense
 * page can't remove anything. The API decides whether the delete is allowed
 * (it refuses anything with order or stock history), and that refusal is shown
 * in place rather than hidden behind the confirmation.
 */
export function DeleteControl({
  action,
  label,
  confirmLabel,
}: {
  action: () => Promise<FormState>;
  label: string;
  /** What the confirmation says is about to go, e.g. "this product". */
  confirmLabel: string;
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
          <span className="text-sm">Delete {confirmLabel} permanently?</span>
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={pending}
          >
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setConfirming(true)}
        >
          {label}
        </Button>
      )}
      <FormError state={state} />
    </div>
  );
}
