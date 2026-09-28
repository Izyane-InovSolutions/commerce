'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField, type SelectOption } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * The review decision on a `REQUESTED` return. Approving needs the
 * warehouse the parcel goes to — every later receipt and inspection is
 * checked against it — and rejecting needs a reason, which the customer
 * sees; so they are two small forms rather than one with half its fields
 * ignored.
 */
export function ReturnReviewForm({
  warehouses,
  approve,
  reject,
}: {
  warehouses: SelectOption[];
  approve: Action;
  reject: Action;
}) {
  const [approveState, approveAction] = useActionState(approve, idleFormState);
  const [rejectState, rejectAction] = useActionState(reject, idleFormState);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form action={approveAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="return-warehouse">Receiving warehouse</Label>
          <SelectField
            id="return-warehouse"
            name="warehouseId"
            required
            placeholder={
              warehouses.length === 0 ? 'No warehouses available' : 'Choose…'
            }
            options={warehouses}
            className="w-full"
            aria-invalid={
              approveState.fieldErrors?.warehouseId ? true : undefined
            }
          />
          <FieldError messages={approveState.fieldErrors?.warehouseId} />
        </div>
        <SubmitButton pendingLabel="Approving…">
          Approve and issue RMA
        </SubmitButton>
        <FieldError messages={approveState.fieldErrors?.version} />
        <FormError state={approveState} />
      </form>

      <form action={rejectAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="return-rejection">Rejection reason</Label>
          <Textarea
            id="return-rejection"
            name="rejectionReason"
            rows={3}
            required
            maxLength={1000}
            placeholder="Shown to the customer."
            aria-invalid={
              rejectState.fieldErrors?.rejectionReason ? true : undefined
            }
          />
          <FieldError messages={rejectState.fieldErrors?.rejectionReason} />
        </div>
        <SubmitButton variant="outline" pendingLabel="Rejecting…">
          Reject
        </SubmitButton>
        <FieldError messages={rejectState.fieldErrors?.version} />
        <FormError state={rejectState} />
      </form>
    </div>
  );
}
