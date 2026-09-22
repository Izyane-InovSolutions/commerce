'use client';

import { useActionState } from 'react';

import { backendProductStatuses } from '@commerce/contracts';

import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Moves one record between the three states the API supports.
 *
 * A product only reaches the storefront when the product, its variant and its
 * offer are all published, which is why this appears at each level.
 */
export function StatusControl({
  current,
  label,
  action,
  hidden,
}: {
  current: string;
  label: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  /** Extra values the action needs, such as which offer is being changed. */
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor={`status-${label}`} className="sr-only">
        {label} status
      </label>
      <SelectField
        id={`status-${label}`}
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
      <FormError state={state} />
      {state.status === 'idle' && state.message ? (
        <span className="text-muted-foreground text-xs" role="status">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
