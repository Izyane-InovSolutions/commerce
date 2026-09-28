'use client';

import { useActionState, useState, type ChangeEvent } from 'react';
import Link from 'next/link';

import { backendCurrencies, type BackendSupplier } from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
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

type Field =
  | 'code'
  | 'legalName'
  | 'tradingName'
  | 'registrationNumber'
  | 'taxNumber'
  | 'contactEmail'
  | 'contactPhone'
  | 'defaultCurrency'
  | 'paymentTermsDays'
  | 'leadTimeDays'
  | 'minimumOrderAmount'
  | 'notes';

function initialValues(supplier?: BackendSupplier): Record<Field, string> {
  return {
    code: supplier?.code ?? '',
    legalName: supplier?.legalName ?? '',
    tradingName: supplier?.tradingName ?? '',
    registrationNumber: supplier?.registrationNumber ?? '',
    taxNumber: supplier?.taxNumber ?? '',
    contactEmail: supplier?.contactEmail ?? '',
    contactPhone: supplier?.contactPhone ?? '',
    defaultCurrency: supplier?.defaultCurrency ?? backendCurrencies[0],
    paymentTermsDays: String(supplier?.paymentTermsDays ?? ''),
    leadTimeDays: String(supplier?.leadTimeDays ?? ''),
    minimumOrderAmount:
      supplier?.minimumOrderAmount == null
        ? ''
        : (supplier.minimumOrderAmount / 100).toFixed(2),
    notes: supplier?.notes ?? '',
  };
}

/**
 * Creates or edits a supplier.
 *
 * The inputs are controlled so a refused submit — a duplicate code, say —
 * leaves what was typed in place; React resets uncontrolled fields after
 * every action. The code and currency are fixed once the supplier exists, so
 * an edit shows them read-only rather than as fields the API would ignore.
 */
export function SupplierForm({
  action,
  supplier,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  supplier?: BackendSupplier;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [values, setValues] = useState(() => initialValues(supplier));
  const fieldErrors = state.fieldErrors ?? {};

  const bind = (name: Field) => ({
    id: `supplier-${name}`,
    name,
    value: values[name],
    onChange: (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => setValues((current) => ({ ...current, [name]: event.target.value })),
    'aria-invalid': fieldErrors[name] ? true : undefined,
  });

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError state={state} />

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>
            {supplier
              ? `Code ${supplier.code}, buying in ${supplier.defaultCurrency}. Neither can change once the supplier exists.`
              : 'The code and currency are fixed once the supplier is created.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {supplier ? null : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="supplier-code">Code</Label>
                <Input
                  {...bind('code')}
                  required
                  className="font-mono uppercase"
                  placeholder="ACME-01"
                />
                <p className="text-muted-foreground text-xs">
                  Uppercase letters, digits, hyphens, or underscores.
                </p>
                <FieldError messages={fieldErrors.code} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-defaultCurrency">Currency</Label>
                <SelectField
                  {...bind('defaultCurrency')}
                  className="w-full"
                  options={backendCurrencies.map((currency) => ({
                    value: currency,
                    label: currency,
                  }))}
                />
                <FieldError messages={fieldErrors.defaultCurrency} />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-legalName">Legal name</Label>
              <Input {...bind('legalName')} required />
              <FieldError messages={fieldErrors.legalName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-tradingName">Trading name</Label>
              <Input {...bind('tradingName')} />
              <FieldError messages={fieldErrors.tradingName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-registrationNumber">
                Registration number
              </Label>
              <Input {...bind('registrationNumber')} />
              <FieldError messages={fieldErrors.registrationNumber} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-taxNumber">Tax number</Label>
              <Input {...bind('taxNumber')} />
              <FieldError messages={fieldErrors.taxNumber} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardDescription>Who purchase orders go to.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="supplier-contactEmail">Email</Label>
            <Input {...bind('contactEmail')} type="email" />
            <FieldError messages={fieldErrors.contactEmail} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier-contactPhone">Phone</Label>
            <Input {...bind('contactPhone')} type="tel" />
            <FieldError messages={fieldErrors.contactPhone} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terms</CardTitle>
          <CardDescription>
            Lead time sets the expected delivery date a new purchase order
            suggests; the minimum order is in the supplier&apos;s currency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-paymentTermsDays">
                Payment terms (days)
              </Label>
              <Input
                {...bind('paymentTermsDays')}
                type="number"
                min={0}
                step="1"
                placeholder="0"
              />
              <FieldError messages={fieldErrors.paymentTermsDays} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-leadTimeDays">Lead time (days)</Label>
              <Input
                {...bind('leadTimeDays')}
                type="number"
                min={0}
                step="1"
                placeholder="0"
              />
              <FieldError messages={fieldErrors.leadTimeDays} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-minimumOrderAmount">Minimum order</Label>
              <Input
                {...bind('minimumOrderAmount')}
                inputMode="decimal"
                placeholder="None"
              />
              <FieldError messages={fieldErrors.minimumOrderAmount} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplier-notes">Notes</Label>
            <Textarea {...bind('notes')} rows={3} />
            <FieldError messages={fieldErrors.notes} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton>
          {supplier ? 'Save changes' : 'Create supplier'}
        </SubmitButton>
        <Button variant="ghost" asChild>
          <Link href="/procurement/suppliers">Cancel</Link>
        </Button>
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-sm" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
