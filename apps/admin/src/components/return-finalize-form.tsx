'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

export type ReturnFinalizeSellerOrder = {
  id: string;
  label: string;
  /** e.g. "K45.00 shipping charged", when the order read carried it. */
  hint?: string;
};

/**
 * Ends inspection and raises one refund case per seller order with accepted
 * units. Shipping is not refunded unless an amount is typed for that seller
 * order, matching the API's default.
 */
export function ReturnFinalizeForm({
  sellerOrders,
  currency,
  ready,
  action,
}: {
  sellerOrders: ReturnFinalizeSellerOrder[];
  currency: string;
  /** False while a received unit is still undecided; the API would refuse. */
  ready: boolean;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-4">
      {sellerOrders.length > 0 ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Shipping refund, per seller order (optional):
          </p>
          {sellerOrders.map((sellerOrder) => {
            const name = `shipping.${sellerOrder.id}`;
            return (
              <div
                key={sellerOrder.id}
                className="flex flex-wrap items-end justify-between gap-3"
              >
                <div>
                  <p className="font-mono text-sm">{sellerOrder.label}</p>
                  {sellerOrder.hint ? (
                    <p className="text-muted-foreground text-xs">
                      {sellerOrder.hint}
                    </p>
                  ) : null}
                </div>
                <div className="w-36 space-y-1.5">
                  <Label htmlFor={name} className="text-xs">
                    Amount ({currency})
                  </Label>
                  <Input
                    id={name}
                    name={name}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-invalid={state.fieldErrors?.[name] ? true : undefined}
                  />
                  <FieldError messages={state.fieldErrors?.[name]} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!ready ? (
        <p className="text-muted-foreground text-sm">
          Every received unit has to be accepted or rejected before this can
          be finalized.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Finalizing…">
          Finalize and raise refunds
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
