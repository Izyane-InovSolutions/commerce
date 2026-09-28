'use client';

import { useActionState } from 'react';

import { DeleteControl } from '@/components/delete-control';
import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { idleFormState, type FormState } from '@/lib/form';

type WarehouseRowFormProps = {
  warehouse: { id: string; name: string; code: string; isActive: boolean };
  save: (state: FormState, formData: FormData) => Promise<FormState>;
  remove: () => Promise<FormState>;
};

/**
 * Edits one warehouse in place, with its delete behind a confirmation.
 *
 * Deactivating is the everyday way to retire a warehouse; deleting is for one
 * opened by mistake. The action refuses a delete that would take stock
 * history with it, and the reason shows under the control.
 */
export function WarehouseRowForm({
  warehouse,
  save,
  remove,
}: WarehouseRowFormProps) {
  const [state, formAction] = useActionState(save, idleFormState);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <form action={formAction} className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`warehouse-name-${warehouse.id}`} className="sr-only">
            Name
          </label>
          <Input
            id={`warehouse-name-${warehouse.id}`}
            name="name"
            defaultValue={warehouse.name}
            required
            className="w-44"
            aria-invalid={state.fieldErrors?.name ? true : undefined}
          />
          <label htmlFor={`warehouse-code-${warehouse.id}`} className="sr-only">
            Code
          </label>
          <Input
            id={`warehouse-code-${warehouse.id}`}
            name="code"
            defaultValue={warehouse.code}
            required
            className="w-32 font-mono text-xs"
            aria-invalid={state.fieldErrors?.code ? true : undefined}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={warehouse.isActive}
              className="size-4"
            />
            Active
          </label>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>

        <FieldError messages={state.fieldErrors?.name} />
        <FieldError messages={state.fieldErrors?.code} />
        <FormError state={state} />
        {state.status === 'idle' && state.message ? (
          <p className="text-muted-foreground text-xs" role="status">
            {state.message}
          </p>
        ) : null}
      </form>

      <DeleteControl
        action={remove}
        label="Delete"
        confirmLabel={`the ${warehouse.name} warehouse`}
      />
    </div>
  );
}
