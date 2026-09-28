'use client';

import { useActionState, useMemo, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { ProductImage } from '@/components/product-image';
import { SubmitButton } from '@/components/submit-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMinor } from '@/lib/currency';
import { idleFormState, type FormState } from '@/lib/form';
import {
  RETURN_NOTE_MAX_LENGTH,
  RETURN_REASON_CODES,
  RETURN_REASON_LABELS,
} from '@/lib/return-types';

/** One order line as the form shows it — already named and priced by the
 * page, since labels come from a server-only lookup. */
export type ReturnFormLine = {
  orderItemId: string;
  name: string;
  imageUrl: string | null;
  unitAmount: number;
  currency: string;
  /** The most that can be returned now; 0 when the line can't be. */
  maxQuantity: number;
  /** When the earliest of its units stops being returnable. */
  returnBy: string | null;
  /** Why not, when `maxQuantity` is 0. */
  unavailableReason: string | null;
};

const SELECT_CLASS =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 disabled:opacity-50';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Asks for a return of some of an order's lines, each with its own
 * quantity and reason — the fields `requestReturnAction` reads
 * (`selected.<id>`, `quantity.<id>`, `reasonCode.<id>`, `note.<id>`).
 *
 * A line's fields are disabled until it is ticked, so an unticked line
 * posts nothing and the action never sees half-filled rows it would ignore
 * anyway.
 */
export function ReturnRequestForm({
  lines,
  action,
}: {
  lines: ReturnFormLine[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [selected, setSelected] = useState<Set<string>>(() => {
    // One returnable line is almost certainly the one they came for.
    const returnable = lines.filter((line) => line.maxQuantity > 0);
    return new Set(
      returnable.length === 1 ? [returnable[0]!.orderItemId] : [],
    );
  });
  // Minted once per mounted form, so a double submit is the same request
  // rather than a second return claiming the same units.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const lineFields = new Set(
    lines.flatMap((line) =>
      ['quantity', 'reasonCode', 'note'].map(
        (field) => `${field}.${line.orderItemId}`,
      ),
    ),
  );
  // Anything the API flagged that isn't one of this form's own fields
  // (its DTO paths, say) still needs to be shown somewhere.
  const otherErrors = Object.entries(state.fieldErrors ?? {})
    .filter(([field]) => !lineFields.has(field))
    .flatMap(([, messages]) => messages);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <ul className="space-y-4">
        {lines.map((line) => {
          const id = line.orderItemId;
          const returnable = line.maxQuantity > 0;
          const isSelected = returnable && selected.has(id);

          return (
            <li key={id} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`selected-${id}`}
                  name={`selected.${id}`}
                  checked={isSelected}
                  disabled={!returnable}
                  onCheckedChange={(checked) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked === true) next.add(id);
                      else next.delete(id);
                      return next;
                    })
                  }
                  className="mt-1"
                />
                <ProductImage
                  src={line.imageUrl}
                  alt={line.name}
                  sizes="48px"
                  className="size-12 shrink-0 rounded-lg"
                  iconClassName="size-5"
                />
                <Label
                  htmlFor={`selected-${id}`}
                  className="flex-1 flex-col items-start gap-0.5 font-normal"
                >
                  <span className="font-medium">{line.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatMinor(line.unitAmount, line.currency)} each
                    {returnable
                      ? ` · up to ${line.maxQuantity} returnable${
                          line.returnBy
                            ? `, return by ${formatDate(line.returnBy)}`
                            : ''
                        }`
                      : ` · ${line.unavailableReason ?? 'Can’t be returned'}`}
                  </span>
                </Label>
              </div>

              {isSelected ? (
                <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`quantity-${id}`}>Quantity</Label>
                    <Input
                      id={`quantity-${id}`}
                      name={`quantity.${id}`}
                      type="number"
                      min={1}
                      max={line.maxQuantity}
                      defaultValue={1}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`reason-${id}`}>Reason</Label>
                    <select
                      id={`reason-${id}`}
                      name={`reasonCode.${id}`}
                      defaultValue=""
                      required
                      className={SELECT_CLASS}
                    >
                      <option value="" disabled>
                        Choose a reason
                      </option>
                      {RETURN_REASON_CODES.map((code) => (
                        <option key={code} value={code}>
                          {RETURN_REASON_LABELS[code]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`note-${id}`}>
                      Anything we should know?{' '}
                      <span className="text-muted-foreground font-normal">
                        (optional)
                      </span>
                    </Label>
                    <textarea
                      id={`note-${id}`}
                      name={`note.${id}`}
                      rows={2}
                      maxLength={RETURN_NOTE_MAX_LENGTH}
                      className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3"
                    />
                  </div>
                </div>
              ) : null}

              <FieldError messages={state.fieldErrors?.[`quantity.${id}`]} />
              <FieldError messages={state.fieldErrors?.[`reasonCode.${id}`]} />
              <FieldError messages={state.fieldErrors?.[`note.${id}`]} />
            </li>
          );
        })}
      </ul>

      <FieldError messages={otherErrors} />
      <FormError state={state} />

      <SubmitButton size="default" pendingLabel="Requesting…">
        Request return
      </SubmitButton>
    </form>
  );
}
