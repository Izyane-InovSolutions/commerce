'use client';

import { useActionState } from 'react';

import { backendProductStatuses } from '@commerce/contracts';

import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Draft, published, or archived.
 *
 * Publishing here is necessary but not sufficient: a customer sees the
 * listing only when the platform's product and variant are published too.
 */
export function OfferStatusControl({
  current,
  version,
  action,
}: {
  current: string;
  version: number;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="version" value={version} />
      <label htmlFor="offer-status-control" className="sr-only">
        Listing status
      </label>
      <SelectField
        id="offer-status-control"
        name="status"
        defaultValue={current}
        options={backendProductStatuses.map((status) => ({
          value: status,
          label: status.charAt(0) + status.slice(1).toLowerCase(),
        }))}
      />
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Apply
      </SubmitButton>
      {state.status === 'idle' && state.message ? (
        <span className="text-muted-foreground text-xs" role="status">
          {state.message}
        </span>
      ) : null}
      <FormError state={state} />
    </form>
  );
}
