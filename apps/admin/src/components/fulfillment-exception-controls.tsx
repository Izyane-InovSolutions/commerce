'use client';

import { useActionState, useState, type ReactNode } from 'react';

import { backendFulfillmentExceptionKinds } from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

/** A fulfillment line as these forms offer it: named, with how much is left. */
export type FulfillmentLineChoice = {
  id: string;
  label: string;
  /** Units still cancellable — active and not yet dispatched. */
  remaining: number;
};

const EXCEPTION_KIND_LABELS: Record<
  (typeof backendFulfillmentExceptionKinds)[number],
  string
> = {
  SHORT_PICK: 'Short pick',
  DAMAGED: 'Damaged',
  MISSING: 'Missing',
};

function SuccessMessage({ state }: { state: FormState }) {
  return state.status === 'idle' && state.message ? (
    <p className="text-muted-foreground text-xs" role="status">
      {state.message}
    </p>
  ) : null;
}

/**
 * A form that stays folded behind one button until it's wanted, so a
 * fulfillment card isn't a wall of inputs. Opening it is also the first of
 * the two steps before anything irreversible is submitted.
 */
function Disclosure({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
    );
  }
  return (
    <div className="bg-background w-full space-y-3 rounded-lg border p-3">
      {children(() => setOpen(false))}
    </div>
  );
}

/**
 * Raises a short pick, damage, or missing-stock exception against one line.
 * Doing so puts the whole fulfillment order on hold until an admin resolves
 * it, which is why the form says so before it's submitted.
 */
export function RaiseExceptionForm({
  idPrefix,
  lines,
  action,
}: {
  /** Keeps input ids unique when several fulfillment orders share a page. */
  idPrefix: string;
  lines: FulfillmentLineChoice[];
  action: FormAction;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <Disclosure label="Report a problem">
      {(close) => (
        <form action={formAction} className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Raising an exception puts this shipment on hold until an
            administrator resolves it.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor={`${idPrefix}-exception-line`}>Line</Label>
              <SelectField
                id={`${idPrefix}-exception-line`}
                name="fulfillmentLineId"
                required
                className="w-full"
                placeholder="Choose a line"
                options={lines.map((line) => ({
                  value: line.id,
                  label: line.label,
                }))}
                aria-invalid={
                  state.fieldErrors?.fulfillmentLineId ? true : undefined
                }
              />
              <FieldError messages={state.fieldErrors?.fulfillmentLineId} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${idPrefix}-exception-type`}>
                What went wrong
              </Label>
              <SelectField
                id={`${idPrefix}-exception-type`}
                name="type"
                required
                className="w-full"
                options={backendFulfillmentExceptionKinds.map((kind) => ({
                  value: kind,
                  label: EXCEPTION_KIND_LABELS[kind],
                }))}
                aria-invalid={state.fieldErrors?.type ? true : undefined}
              />
              <FieldError messages={state.fieldErrors?.type} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-exception-quantity`}>Units</Label>
              <Input
                id={`${idPrefix}-exception-quantity`}
                name="quantity"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                defaultValue={1}
                required
                aria-invalid={state.fieldErrors?.quantity ? true : undefined}
              />
              <FieldError messages={state.fieldErrors?.quantity} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-exception-reason`}>Reason</Label>
            <Textarea
              id={`${idPrefix}-exception-reason`}
              name="reason"
              rows={2}
              required
              maxLength={1000}
              placeholder="What the warehouse found."
              aria-invalid={state.fieldErrors?.reason ? true : undefined}
            />
            <FieldError messages={state.fieldErrors?.reason} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton variant="secondary" pendingLabel="Raising…">
              Raise exception
            </SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              Close
            </Button>
          </div>
          <FormError state={state} />
          <SuccessMessage state={state} />
        </form>
      )}
    </Disclosure>
  );
}

/**
 * Resolves one open exception. Which way is the button pressed: resume ships
 * the line as it stands, cancel units also cancels the exception's quantity
 * off the line and returns that stock.
 */
export function ResolveExceptionForm({
  idPrefix,
  quantity,
  action,
}: {
  idPrefix: string;
  /** The exception's own quantity, named on the cancel button. */
  quantity: number;
  action: FormAction;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-resolution`}>Resolution</Label>
        <Textarea
          id={`${idPrefix}-resolution`}
          name="resolution"
          rows={2}
          required
          maxLength={1000}
          placeholder="What was done about it — recorded on the fulfillment history."
          aria-invalid={state.fieldErrors?.resolution ? true : undefined}
        />
        <FieldError messages={state.fieldErrors?.resolution} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton
          name="action"
          value="resume"
          variant="secondary"
          pendingLabel="Resolving…"
        >
          Resume as is
        </SubmitButton>
        <SubmitButton
          name="action"
          value="cancel_quantity"
          variant="outline"
          pendingLabel="Resolving…"
        >
          Cancel {quantity} {quantity === 1 ? 'unit' : 'units'}
        </SubmitButton>
      </div>
      <FieldError messages={state.fieldErrors?.action} />
      <FormError state={state} />
      <SuccessMessage state={state} />
    </form>
  );
}

/**
 * Cancels units off one or more lines. Cancelled stock goes back to the
 * warehouse and the API records a refund owed for it — there's no undo, so
 * the form is folded away and spells that out before the submit.
 */
export function CancelLinesForm({
  idPrefix,
  lines,
  action,
}: {
  idPrefix: string;
  lines: FulfillmentLineChoice[];
  action: FormAction;
}) {
  const [state, formAction, pending] = useActionState(action, idleFormState);

  return (
    <Disclosure label="Cancel units">
      {(close) => (
        <form action={formAction} className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Cancelled units go back to stock and the customer is owed a refund
            for them. This can&apos;t be undone.
          </p>
          <ul className="space-y-2">
            {lines.map((line, index) => {
              const field = `lines.${index}.quantity`;
              return (
                <li
                  key={line.id}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <input
                    type="hidden"
                    name={`lines.${index}.fulfillmentLineId`}
                    value={line.id}
                  />
                  <Label
                    htmlFor={`${idPrefix}-cancel-${index}`}
                    className="text-sm font-normal"
                  >
                    {line.label}{' '}
                    <span className="text-muted-foreground">
                      ({line.remaining} left)
                    </span>
                  </Label>
                  <div className="space-y-1">
                    <Input
                      id={`${idPrefix}-cancel-${index}`}
                      name={field}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={line.remaining}
                      step={1}
                      placeholder="0"
                      className="w-20"
                      aria-invalid={
                        state.fieldErrors?.[field] ? true : undefined
                      }
                    />
                    <FieldError messages={state.fieldErrors?.[field]} />
                  </div>
                </li>
              );
            })}
          </ul>
          <FieldError messages={state.fieldErrors?.lines} />
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-cancel-reason`}>Reason</Label>
            <Textarea
              id={`${idPrefix}-cancel-reason`}
              name="reason"
              rows={2}
              required
              maxLength={1000}
              placeholder="Why these units won't ship."
              aria-invalid={state.fieldErrors?.reason ? true : undefined}
            />
            <FieldError messages={state.fieldErrors?.reason} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={pending}
            >
              {pending ? 'Cancelling…' : 'Cancel these units'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={close}
            >
              Keep them
            </Button>
          </div>
          <FormError state={state} />
          <SuccessMessage state={state} />
        </form>
      )}
    </Disclosure>
  );
}

/**
 * Cancels a shipment that hasn't left yet (`PENDING_BOOKING` or `BOOKED`).
 * Its packed units go back to the fulfillment order, ready for another
 * shipment, so this is the way out of a wrong booking rather than an order
 * cancellation.
 */
export function CancelShipmentForm({
  idPrefix,
  shipmentNumber,
  action,
}: {
  idPrefix: string;
  shipmentNumber: string;
  action: FormAction;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <Disclosure label="Cancel shipment">
      {(close) => (
        <form action={formAction} className="space-y-3">
          <p className="text-sm">
            Cancel {shipmentNumber}? Its packed units return to this fulfillment
            order for a new shipment.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-cancel-reason`}>Reason</Label>
            <Textarea
              id={`${idPrefix}-cancel-reason`}
              name="reason"
              rows={2}
              required
              maxLength={1000}
              placeholder="Why this shipment isn't going."
              aria-invalid={state.fieldErrors?.reason ? true : undefined}
            />
            <FieldError messages={state.fieldErrors?.reason} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton variant="secondary" pendingLabel="Cancelling…">
              Cancel shipment
            </SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              Keep it
            </Button>
          </div>
          <FormError state={state} />
          <SuccessMessage state={state} />
        </form>
      )}
    </Disclosure>
  );
}
