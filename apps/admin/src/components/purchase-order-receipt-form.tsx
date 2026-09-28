'use client';

import { useActionState, useState, type ChangeEvent } from 'react';
import Link from 'next/link';

import type { BackendPurchaseOrderLine } from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { idleFormState, type FormState } from '@/lib/form';
import { optionalWholeNumber, rowField } from '@/lib/form-rows';
import { outstandingQuantity } from '@/lib/procurement';

type CountField = 'acceptedQuantity' | 'rejectedQuantity' | 'damagedQuantity';

type RowValues = Record<CountField | 'discrepancyReason', string> & {
  authorizeExcess: boolean;
};

const BLANK: RowValues = {
  acceptedQuantity: '',
  rejectedQuantity: '',
  damagedQuantity: '',
  discrepancyReason: '',
  authorizeExcess: false,
};

/** A typed count, treating blank and not-yet-valid as zero for the preview. */
function count(value: string): number {
  const parsed = optionalWholeNumber(value);
  return parsed === undefined || Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Records one delivery against a purchase order: per line, how much was
 * accepted into stock and how much was turned away as rejected or damaged.
 *
 * Delivered is never typed — it is the sum of the three, which is exactly
 * the reconciliation the API insists on. Rows post as `receipt.<n>.<field>`
 * with `n` the line's position on the order, and the inputs are controlled
 * so a refused submit keeps every count that was typed.
 */
export function PurchaseOrderReceiptForm({
  action,
  lines,
  labels,
  warehouseName,
  canAuthorizeExcess,
  cancelHref,
}: {
  /** Bound to the order and an idempotency key minted for this render. */
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  lines: BackendPurchaseOrderLine[];
  /** Variant labels by variant id. */
  labels: Record<string, { product: string; sku: string }>;
  warehouseName: string;
  canAuthorizeExcess: boolean;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [rows, setRows] = useState<Record<string, RowValues>>({});
  const [deliveryNote, setDeliveryNote] = useState('');
  const fieldErrors = state.fieldErrors ?? {};

  const valuesOf = (lineId: string) => rows[lineId] ?? BLANK;
  const update = (lineId: string, patch: Partial<RowValues>) =>
    setRows((current) => ({
      ...current,
      [lineId]: { ...(current[lineId] ?? BLANK), ...patch },
    }));

  const acceptedItems = lines.reduce(
    (sum, line) =>
      sum + count(valuesOf(line.id).acceptedQuantity) * line.packSize,
    0,
  );

  return (
    <form action={formAction} className="space-y-6">
      <FormError state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Into warehouse</p>
          <p className="text-muted-foreground text-sm">
            {warehouseName} — the order&apos;s own; the API accepts no other.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receipt-delivery-note">Supplier delivery note</Label>
          <Input
            id="receipt-delivery-note"
            name="supplierDeliveryNoteRef"
            value={deliveryNote}
            onChange={(event) => setDeliveryNote(event.target.value)}
            placeholder="Optional — each note can be received once"
            aria-invalid={
              fieldErrors.supplierDeliveryNoteRef ? true : undefined
            }
          />
          <FieldError messages={fieldErrors.supplierDeliveryNoteRef} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Line</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Accepted</TableHead>
              <TableHead>Rejected</TableHead>
              <TableHead>Damaged</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead>Discrepancy reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const values = valuesOf(line.id);
              const outstanding = outstandingQuantity(line);
              const delivered =
                count(values.acceptedQuantity) +
                count(values.rejectedQuantity) +
                count(values.damagedQuantity);
              const over = count(values.acceptedQuantity) > outstanding;
              const field = (name: string) => rowField('receipt', index, name);
              const label = labels[line.variantId];

              const countInput = (name: CountField, text: string) => (
                <div className="w-20 space-y-1">
                  <Label htmlFor={field(name)} className="sr-only">
                    {text}
                  </Label>
                  <Input
                    id={field(name)}
                    name={field(name)}
                    type="number"
                    min={0}
                    step="1"
                    placeholder="0"
                    value={values[name]}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      update(line.id, { [name]: event.target.value })
                    }
                    aria-invalid={fieldErrors[field(name)] ? true : undefined}
                  />
                </div>
              );

              return (
                <TableRow key={line.id} className="align-top">
                  <TableCell>
                    <input
                      type="hidden"
                      name={field('purchaseOrderLineId')}
                      value={line.id}
                    />
                    <span className="font-medium">
                      {label?.product ?? 'Unnamed product'}
                    </span>
                    <p className="text-muted-foreground font-mono text-xs">
                      {label?.sku ?? line.variantId}
                      {line.packSize > 1 ? ` · packs of ${line.packSize}` : ''}
                    </p>
                    <FieldError
                      messages={fieldErrors[field('acceptedQuantity')]}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {outstanding}
                  </TableCell>
                  <TableCell>
                    {countInput('acceptedQuantity', 'Accepted')}
                    {over && canAuthorizeExcess ? (
                      <label className="mt-1 flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          name={field('authorizeExcess')}
                          checked={values.authorizeExcess}
                          onChange={(event) =>
                            update(line.id, {
                              authorizeExcess: event.target.checked,
                            })
                          }
                        />
                        Authorize {count(values.acceptedQuantity) - outstanding}{' '}
                        extra
                      </label>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {countInput('rejectedQuantity', 'Rejected')}
                    <FieldError
                      messages={fieldErrors[field('rejectedQuantity')]}
                    />
                  </TableCell>
                  <TableCell>
                    {countInput('damagedQuantity', 'Damaged')}
                    <FieldError
                      messages={fieldErrors[field('damagedQuantity')]}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {delivered}
                  </TableCell>
                  <TableCell>
                    <Label
                      htmlFor={field('discrepancyReason')}
                      className="sr-only"
                    >
                      Discrepancy reason
                    </Label>
                    <Input
                      id={field('discrepancyReason')}
                      name={field('discrepancyReason')}
                      className="min-w-48"
                      value={values.discrepancyReason}
                      onChange={(event) =>
                        update(line.id, {
                          discrepancyReason: event.target.value,
                        })
                      }
                      placeholder={
                        delivered > count(values.acceptedQuantity) || over
                          ? 'Required'
                          : 'Only if something was off'
                      }
                      aria-invalid={
                        fieldErrors[field('discrepancyReason')]
                          ? true
                          : undefined
                      }
                    />
                    <FieldError
                      messages={fieldErrors[field('discrepancyReason')]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-muted-foreground text-sm">
        {acceptedItems === 0
          ? 'Only accepted quantities reach stock. Rejected and damaged units are recorded but never received.'
          : `${acceptedItems} single ${acceptedItems === 1 ? 'item goes' : 'items go'} into stock when this is posted.`}
        {canAuthorizeExcess
          ? null
          : ' Accepting more than is outstanding needs an administrator.'}
      </p>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Posting…">Post receipt</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
