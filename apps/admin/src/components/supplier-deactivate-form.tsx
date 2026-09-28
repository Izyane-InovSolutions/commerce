'use client';

import { useActionState } from 'react';

import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Deactivates a supplier, behind a checkbox the browser requires first.
 *
 * The API has no way back — there is no reactivate route — so the one-way
 * nature is spelled out and confirmed rather than left to a single click.
 * The action arrives already bound to the supplier and the version this page
 * read, so the form posts nothing it needs.
 */
export function SupplierDeactivateForm({
  action,
}: {
  action: () => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(
    async () => action(),
    idleFormState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="mt-0.5" />
        <span>
          I understand this cannot be undone here: the supplier stays on
          existing purchase orders but can&apos;t be named on new ones.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant="outline" pendingLabel="Deactivating…">
          Deactivate supplier
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
