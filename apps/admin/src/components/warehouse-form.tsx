'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/** Opens a warehouse. Stock is keyed by variant and warehouse, so one of
 * these has to exist before anything can be received. */
export function WarehouseForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="warehouse-name">Name</Label>
          <Input
            id="warehouse-name"
            name="name"
            placeholder="Lusaka main"
            required
            aria-invalid={state.fieldErrors?.name ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.name} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="warehouse-code">Code</Label>
          <Input
            id="warehouse-code"
            name="code"
            placeholder="LUS-01"
            required
            aria-invalid={state.fieldErrors?.code ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.code} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Creating…">Add warehouse</SubmitButton>
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
