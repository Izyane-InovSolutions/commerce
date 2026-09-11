'use client';

import { useActionState } from 'react';
import Link from 'next/link';

import type { Offer, SkuSummary } from '@commerce/contracts';
import {
  fulfillmentModes,
  offerConditions,
  offerStatuses,
} from '@commerce/contracts';

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
import { idleFormState, type FormState } from '@/lib/form';

const FULFILLMENT_LABELS: Record<string, string> = {
  platform: 'Platform fulfilled',
  seller: 'I fulfil this myself',
  threepl: '3PL',
  pickup: 'Customer pickup',
};

function toDecimal(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

type OfferFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  /** SKUs available to offer against. Omitted when editing an existing offer. */
  skus?: SkuSummary[];
  offer?: Offer;
};

export function OfferForm({ action, skus, offer }: OfferFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError state={state} />

      <Card>
        <CardHeader>
          <CardTitle>What you are selling</CardTitle>
          <CardDescription>
            An offer sits against a catalog SKU. The product itself belongs to
            the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {offer ? (
            <div className="space-y-1.5">
              <Label>SKU</Label>
              <p className="text-sm font-medium">
                {offer.productName}
                <span className="text-muted-foreground">
                  {' '}
                  · {offer.variantName}
                </span>
              </p>
              <p className="text-muted-foreground font-mono text-xs">
                {offer.skuCode}
              </p>
              <p className="text-muted-foreground text-xs">
                To sell a different SKU, create a separate offer.
              </p>
              <input type="hidden" name="skuId" value={offer.skuId} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="skuId">SKU</Label>
              <SelectField
                id="skuId"
                name="skuId"
                required
                className="w-full"
                placeholder="Choose a SKU"
                aria-invalid={fieldErrors.skuId !== undefined}
                options={(skus ?? []).map((sku) => ({
                  value: sku.skuId,
                  label: `${sku.productName} · ${sku.variantName} (${sku.skuCode})`,
                }))}
              />
              <FieldError messages={fieldErrors.skuId} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commercial terms</CardTitle>
          <CardDescription>
            The API is authoritative on price. What you enter here is a proposal
            it validates and stores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="price">Price (GBP)</Label>
              <Input
                id="price"
                name="price"
                inputMode="decimal"
                placeholder="249.99"
                required
                defaultValue={offer ? toDecimal(offer.price.amountMinor) : ''}
                aria-invalid={fieldErrors.price !== undefined}
              />
              <FieldError messages={fieldErrors.price} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compareAtPrice">Compare-at price</Label>
              <Input
                id="compareAtPrice"
                name="compareAtPrice"
                inputMode="decimal"
                placeholder="Optional"
                defaultValue={
                  offer?.compareAtPrice
                    ? toDecimal(offer.compareAtPrice.amountMinor)
                    : ''
                }
                aria-invalid={fieldErrors.compareAtPrice !== undefined}
              />
              <FieldError messages={fieldErrors.compareAtPrice} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="condition">Condition</Label>
              <SelectField
                id="condition"
                name="condition"
                className="w-full"
                defaultValue={offer?.condition ?? 'new'}
                options={offerConditions.map((condition) => ({
                  value: condition,
                  label: condition.charAt(0).toUpperCase() + condition.slice(1),
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <SelectField
                id="status"
                name="status"
                className="w-full"
                defaultValue={offer?.status ?? 'draft'}
                options={offerStatuses.map((status) => ({
                  value: status,
                  label: status.charAt(0).toUpperCase() + status.slice(1),
                }))}
              />
              <p className="text-muted-foreground text-xs">
                Only active offers are buyable on the storefront.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fulfillmentMode">Fulfillment</Label>
              <SelectField
                id="fulfillmentMode"
                name="fulfillmentMode"
                className="w-full"
                defaultValue={offer?.fulfillmentMode ?? 'seller'}
                options={fulfillmentModes.map((mode) => ({
                  value: mode,
                  label: FULFILLMENT_LABELS[mode] ?? mode,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="handlingTimeDays">Handling time (days)</Label>
              <Input
                id="handlingTimeDays"
                name="handlingTimeDays"
                type="number"
                min={0}
                max={30}
                defaultValue={offer?.handlingTimeDays ?? 1}
                aria-invalid={fieldErrors.handlingTimeDays !== undefined}
              />
              <FieldError messages={fieldErrors.handlingTimeDays} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton>{offer ? 'Save changes' : 'Create offer'}</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href="/offers">Cancel</Link>
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
