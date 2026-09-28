'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';
import { RETURN_DISPOSITION_LABELS } from '@/lib/returns';

export type ReturnInspectionItem = {
  id: string;
  title: string;
  detail: string;
  /** Received but not yet accepted or rejected. */
  toInspect: number;
};

const DISPOSITION_OPTIONS = Object.entries(RETURN_DISPOSITION_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/**
 * One inspection pass: for each received item, how many units are accepted
 * (and where they go) and how many are rejected (and why). Several passes
 * are fine — the return stays in inspection until it is finalized. Accepted
 * units marked Restock go straight back into available stock at the
 * receiving warehouse.
 */
export function ReturnInspectionForm({
  items,
  idempotencyKey,
  action,
}: {
  items: ReturnInspectionItem[];
  idempotencyKey: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id} className="space-y-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-muted-foreground text-xs">
                {item.detail} · {item.toInspect} awaiting inspection
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`accept.${item.id}`} className="text-xs">
                  Accepted
                </Label>
                <Input
                  id={`accept.${item.id}`}
                  name={`accept.${item.id}`}
                  type="number"
                  min={0}
                  max={item.toInspect}
                  step={1}
                  defaultValue={item.toInspect}
                  aria-invalid={errors[`accept.${item.id}`] ? true : undefined}
                />
                <FieldError messages={errors[`accept.${item.id}`]} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`disposition.${item.id}`} className="text-xs">
                  Disposition of accepted units
                </Label>
                <SelectField
                  id={`disposition.${item.id}`}
                  name={`disposition.${item.id}`}
                  placeholder="Choose…"
                  defaultValue="RESTOCK"
                  options={DISPOSITION_OPTIONS}
                  className="w-full"
                  aria-invalid={
                    errors[`disposition.${item.id}`] ? true : undefined
                  }
                />
                <FieldError messages={errors[`disposition.${item.id}`]} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`reject.${item.id}`} className="text-xs">
                  Rejected
                </Label>
                <Input
                  id={`reject.${item.id}`}
                  name={`reject.${item.id}`}
                  type="number"
                  min={0}
                  max={item.toInspect}
                  step={1}
                  defaultValue={0}
                  aria-invalid={errors[`reject.${item.id}`] ? true : undefined}
                />
                <FieldError messages={errors[`reject.${item.id}`]} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`reason.${item.id}`} className="text-xs">
                  Rejection reason
                </Label>
                <Input
                  id={`reason.${item.id}`}
                  name={`reason.${item.id}`}
                  maxLength={500}
                  placeholder="Required if any are rejected"
                  aria-invalid={errors[`reason.${item.id}`] ? true : undefined}
                />
                <FieldError messages={errors[`reason.${item.id}`]} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <FieldError messages={errors.lines} />

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Recording…">Record inspection</SubmitButton>
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
