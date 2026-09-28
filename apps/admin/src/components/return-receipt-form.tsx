'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

export type ReturnReceiptItem = {
  id: string;
  title: string;
  detail: string;
  /** Still expected; the input defaults to — and is capped at — this. */
  toReceive: number;
};

/**
 * Records a delivery at the receiving warehouse. Each row defaults to
 * everything still expected, since a return usually arrives in one parcel;
 * marking it closing tells the API nothing more is coming, which releases
 * the unreceived units and moves the return on to inspection.
 */
export function ReturnReceiptForm({
  items,
  idempotencyKey,
  action,
}: {
  items: ReturnReceiptItem[];
  /** Minted per render by the page; see `app/returns/actions.ts`. */
  idempotencyKey: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <ul className="space-y-3">
        {items.map((item) => {
          const name = `receive.${item.id}`;
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-end justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-muted-foreground text-xs">
                  {item.detail} · {item.toReceive} still expected
                </p>
              </div>
              <div className="w-28 space-y-1.5">
                <Label htmlFor={name} className="text-xs">
                  Units received
                </Label>
                <Input
                  id={name}
                  name={name}
                  type="number"
                  min={0}
                  max={item.toReceive}
                  step={1}
                  defaultValue={item.toReceive}
                  aria-invalid={state.fieldErrors?.[name] ? true : undefined}
                />
                <FieldError messages={state.fieldErrors?.[name]} />
              </div>
            </li>
          );
        })}
      </ul>
      <FieldError messages={state.fieldErrors?.lines} />

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="isClosing" className="mt-0.5" />
        <span>
          This is the last delivery — nothing else is coming. Anything not
          received is released back to the order, and the return moves to
          inspection. (A receipt that brings in everything expected always
          counts as the last one.)
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Recording…">Record receipt</SubmitButton>
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
