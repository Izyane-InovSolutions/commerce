'use client';

import { useActionState, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';

import type { BackendPurchaseOrder } from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField, type SelectOption } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';
import { optionalWholeNumber, rowField, wholeNumber } from '@/lib/form-rows';
import { formatMinor, toMinor } from '@/lib/money';
import {
  basisPointsToPercent,
  computeLineAmounts,
  computeOrderTotals,
  percentToBasisPoints,
} from '@/lib/procurement';

export type SupplierOption = SelectOption & {
  currency: string;
  leadTimeDays: number;
};

type Header = {
  supplierId: string;
  warehouseId: string;
  currency: string;
  shipping: string;
  expectedDeliveryDate: string;
  notes: string;
};

type LineField =
  | 'variantId'
  | 'supplierSku'
  | 'packSize'
  | 'orderedQuantity'
  | 'unitCost'
  | 'discount'
  | 'taxPercent';

/** `key` is the index the row posts under — never reused, never shifted. */
type Row = { key: number } & Record<LineField, string>;

function blankRow(key: number): Row {
  return {
    key,
    variantId: '',
    supplierSku: '',
    packSize: '',
    orderedQuantity: '',
    unitCost: '',
    discount: '',
    taxPercent: '',
  };
}

/** 1 while the pack size is blank or not yet a valid number. */
function packSizeOf(row: Row): number {
  const packSize = optionalWholeNumber(row.packSize, 1);
  return packSize === undefined || Number.isNaN(packSize) ? 1 : packSize;
}

function majorUnits(amount: number): string {
  return (amount / 100).toFixed(2);
}

function initialRows(po?: BackendPurchaseOrder): Row[] {
  if (!po || po.lines.length === 0) return [blankRow(0)];
  return po.lines.map((line, key) => ({
    key,
    variantId: line.variantId,
    supplierSku: line.supplierSku ?? '',
    packSize: line.packSize === 1 ? '' : String(line.packSize),
    orderedQuantity: String(line.orderedQuantity),
    unitCost: majorUnits(line.unitCostAmount),
    discount: line.discountAmount === 0 ? '' : majorUnits(line.discountAmount),
    taxPercent:
      line.taxRateBasisPoints === 0
        ? ''
        : basisPointsToPercent(line.taxRateBasisPoints),
  }));
}

/** Today plus `days`, as the `YYYY-MM-DD` a date input holds. */
function daysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A line's amounts while it is being typed, or null until it adds up — the
 * same arithmetic the API applies when it saves.
 */
function previewLine(row: Row) {
  const orderedQuantity = wholeNumber(row.orderedQuantity, 1);
  const unitCostAmount = row.unitCost ? toMinor(row.unitCost) : Number.NaN;
  const discountAmount = row.discount ? toMinor(row.discount) : 0;
  const taxRateBasisPoints = row.taxPercent
    ? percentToBasisPoints(row.taxPercent)
    : 0;
  if (
    [orderedQuantity, unitCostAmount, discountAmount, taxRateBasisPoints].some(
      Number.isNaN,
    )
  ) {
    return null;
  }
  return computeLineAmounts({
    orderedQuantity,
    unitCostAmount,
    discountAmount,
    taxRateBasisPoints,
  });
}

/**
 * Raises or edits a draft purchase order, lines and all.
 *
 * Every input is controlled: React resets uncontrolled fields after each
 * action, which would wipe a dozen typed lines the moment the API refused
 * one of them. Rows post as `lines.<key>.<field>`, and a removed row simply
 * leaves a gap in the keys, so an error always finds the row it belongs to.
 * Money is typed in major units and tax as a percent; the server action
 * converts both.
 */
export function PurchaseOrderForm({
  action,
  suppliers,
  warehouses,
  variants,
  currencies,
  purchaseOrder,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  suppliers: SupplierOption[];
  warehouses: SelectOption[];
  variants: SelectOption[];
  currencies: readonly string[];
  purchaseOrder?: BackendPurchaseOrder;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [header, setHeader] = useState<Header>(() => ({
    supplierId: purchaseOrder?.supplierId ?? '',
    warehouseId: purchaseOrder?.warehouseId ?? '',
    currency: purchaseOrder?.currency ?? currencies[0] ?? '',
    shipping: purchaseOrder ? majorUnits(purchaseOrder.shippingAmount) : '',
    expectedDeliveryDate:
      purchaseOrder?.expectedDeliveryDate?.slice(0, 10) ?? '',
    notes: purchaseOrder?.notes ?? '',
  }));
  const [rows, setRows] = useState<Row[]>(() => initialRows(purchaseOrder));
  const [nextKey, setNextKey] = useState(() => rows.length);

  const fieldErrors = state.fieldErrors ?? {};
  const lineError = (key: number, field: LineField) =>
    fieldErrors[rowField('lines', key, field)];

  const setHeaderField =
    (name: keyof Header) =>
    (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setHeader((current) => ({ ...current, [name]: event.target.value }));

  // Picking a supplier fills in what it implies — its currency, and a
  // delivery date its lead time away — without overwriting a date already
  // chosen.
  const chooseSupplier = (event: ChangeEvent<HTMLSelectElement>) => {
    const supplier = suppliers.find(
      (option) => option.value === event.target.value,
    );
    setHeader((current) => ({
      ...current,
      supplierId: event.target.value,
      currency:
        supplier && currencies.includes(supplier.currency)
          ? supplier.currency
          : current.currency,
      expectedDeliveryDate:
        current.expectedDeliveryDate === '' &&
        supplier &&
        supplier.leadTimeDays > 0
          ? daysFromToday(supplier.leadTimeDays)
          : current.expectedDeliveryDate,
    }));
  };

  const setRowField =
    (key: number, name: LineField) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setRows((current) =>
        current.map((row) =>
          row.key === key ? { ...row, [name]: event.target.value } : row,
        ),
      );

  const addRow = () => {
    setRows((current) => [...current, blankRow(nextKey)]);
    setNextKey((key) => key + 1);
  };

  const removeRow = (key: number) =>
    setRows((current) => current.filter((row) => row.key !== key));

  const previews = rows.map(previewLine);
  const shippingAmount = header.shipping ? toMinor(header.shipping) : 0;
  const totals = computeOrderTotals(
    previews.filter(
      (preview): preview is NonNullable<typeof preview> => preview !== null,
    ),
    Number.isNaN(shippingAmount) ? 0 : shippingAmount,
  );
  const complete = previews.every((preview) => preview !== null);
  const money = (amount: number) =>
    header.currency ? formatMinor(amount, header.currency) : String(amount);

  const inputProps = (row: Row, name: LineField) => ({
    id: `line-${row.key}-${name}`,
    name: rowField('lines', row.key, name),
    value: row[name],
    onChange: setRowField(row.key, name),
    'aria-invalid': lineError(row.key, name) ? true : undefined,
  });

  return (
    <form action={formAction} className="space-y-6">
      <FormError state={state} />

      <Card>
        <CardHeader>
          <CardTitle>Order</CardTitle>
          <CardDescription>
            Who it is from and where it is delivered. Only active suppliers and
            warehouses can be chosen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-supplier">Supplier</Label>
              <SelectField
                id="po-supplier"
                name="supplierId"
                className="w-full"
                placeholder="Choose a supplier"
                options={suppliers}
                value={header.supplierId}
                onChange={chooseSupplier}
                required
                aria-invalid={fieldErrors.supplierId ? true : undefined}
              />
              <FieldError messages={fieldErrors.supplierId} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-warehouse">Deliver to</Label>
              <SelectField
                id="po-warehouse"
                name="warehouseId"
                className="w-full"
                placeholder="Choose a warehouse"
                options={warehouses}
                value={header.warehouseId}
                onChange={setHeaderField('warehouseId')}
                required
                aria-invalid={fieldErrors.warehouseId ? true : undefined}
              />
              <FieldError messages={fieldErrors.warehouseId} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-currency">Currency</Label>
              <SelectField
                id="po-currency"
                name="currency"
                className="w-full"
                options={currencies.map((currency) => ({
                  value: currency,
                  label: currency,
                }))}
                value={header.currency}
                onChange={setHeaderField('currency')}
              />
              <FieldError messages={fieldErrors.currency} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-expected">Expected delivery</Label>
              <Input
                id="po-expected"
                name="expectedDeliveryDate"
                type="date"
                value={header.expectedDeliveryDate}
                onChange={setHeaderField('expectedDeliveryDate')}
                aria-invalid={
                  fieldErrors.expectedDeliveryDate ? true : undefined
                }
              />
              {purchaseOrder?.expectedDeliveryDate ? (
                <p className="text-muted-foreground text-xs">
                  Can be moved but not cleared once set.
                </p>
              ) : null}
              <FieldError messages={fieldErrors.expectedDeliveryDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-shipping">Shipping</Label>
              <Input
                id="po-shipping"
                name="shipping"
                inputMode="decimal"
                placeholder="0.00"
                value={header.shipping}
                onChange={setHeaderField('shipping')}
                aria-invalid={fieldErrors.shipping ? true : undefined}
              />
              <p className="text-muted-foreground text-xs">
                Added once to the total, untaxed.
              </p>
              <FieldError messages={fieldErrors.shipping} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po-notes">Notes</Label>
            <Textarea
              id="po-notes"
              name="notes"
              rows={2}
              value={header.notes}
              onChange={setHeaderField('notes')}
            />
            <FieldError messages={fieldErrors.notes} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <CardDescription>
            Quantities are in the supplier&apos;s unit — set a pack size when
            they sell by the case, and receiving converts it to single items.
            The discount is for the whole line.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row, position) => {
            const preview = previews[position];
            return (
              <fieldset
                key={row.key}
                className="space-y-3 rounded-lg border p-3"
                aria-label={`Line ${position + 1}`}
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor={`line-${row.key}-variantId`}>Variant</Label>
                    <SelectField
                      {...inputProps(row, 'variantId')}
                      className="w-full"
                      placeholder="Choose a variant"
                      options={variants}
                    />
                    <FieldError messages={lineError(row.key, 'variantId')} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length === 1}
                    aria-label={`Remove line ${position + 1}`}
                  >
                    <Trash2 data-icon="inline-start" />
                    Remove
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="space-y-1.5">
                    <Label htmlFor={`line-${row.key}-orderedQuantity`}>
                      Quantity
                    </Label>
                    <Input
                      {...inputProps(row, 'orderedQuantity')}
                      type="number"
                      min={1}
                      step="1"
                    />
                    <FieldError
                      messages={lineError(row.key, 'orderedQuantity')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`line-${row.key}-unitCost`}>
                      Unit cost
                    </Label>
                    <Input
                      {...inputProps(row, 'unitCost')}
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                    <FieldError messages={lineError(row.key, 'unitCost')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`line-${row.key}-discount`}>Discount</Label>
                    <Input
                      {...inputProps(row, 'discount')}
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                    <FieldError messages={lineError(row.key, 'discount')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`line-${row.key}-taxPercent`}>Tax %</Label>
                    <Input
                      {...inputProps(row, 'taxPercent')}
                      inputMode="decimal"
                      placeholder="0"
                    />
                    <FieldError messages={lineError(row.key, 'taxPercent')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`line-${row.key}-packSize`}>
                      Pack size
                    </Label>
                    <Input
                      {...inputProps(row, 'packSize')}
                      type="number"
                      min={1}
                      step="1"
                      placeholder="1"
                    />
                    <FieldError messages={lineError(row.key, 'packSize')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`line-${row.key}-supplierSku`}>
                      Supplier SKU
                    </Label>
                    <Input {...inputProps(row, 'supplierSku')} />
                    <FieldError messages={lineError(row.key, 'supplierSku')} />
                  </div>
                </div>

                <p className="text-muted-foreground text-right text-xs tabular-nums">
                  {preview
                    ? `${money(preview.netAmount)} + ${money(preview.taxAmount)} tax = ${money(preview.grossAmount)}`
                    : 'Line total shows once quantity and cost are filled in.'}
                  {preview && packSizeOf(row) > 1
                    ? ` · ${wholeNumber(row.orderedQuantity, 1) * packSizeOf(row)} single items`
                    : null}
                </p>
              </fieldset>
            );
          })}

          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus data-icon="inline-start" />
            Add line
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <dl className="ml-auto grid max-w-xs grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-right">{money(totals.subtotalAmount)}</dd>
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="text-right">{money(totals.taxAmount)}</dd>
            <dt className="text-muted-foreground">Shipping</dt>
            <dd className="text-right">
              {money(Number.isNaN(shippingAmount) ? 0 : shippingAmount)}
            </dd>
            <dt className="font-medium">Total</dt>
            <dd className="text-right font-medium">
              {money(totals.totalAmount)}
            </dd>
          </dl>
          {complete ? null : (
            <p className="text-muted-foreground mt-2 text-right text-xs">
              Lines that aren&apos;t filled in yet are left out of the total.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton>
          {purchaseOrder ? 'Save draft' : 'Create draft'}
        </SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
