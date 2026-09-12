'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { StatusControl } from '@/components/status-control';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

type OfferSummary = {
  id: string;
  status: string;
  /** One formatted price per currency the offer is currently priced in. */
  prices: string[];
};

/**
 * The offers on one variant.
 *
 * An offer holds no price itself — prices are a list on it, and the newest
 * applicable one wins — so adding a price is a separate action from creating
 * the offer.
 */
export function OfferControls({
  variantLabel,
  offers,
  createOffer,
  addPrice,
  setOfferStatus,
}: {
  productId: string;
  variantId: string;
  variantLabel: string;
  offers: OfferSummary[];
  createOffer: (state: FormState, formData: FormData) => Promise<FormState>;
  addPrice: (state: FormState, formData: FormData) => Promise<FormState>;
  setOfferStatus: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [createState, createAction] = useActionState(
    createOffer,
    idleFormState,
  );

  if (offers.length === 0) {
    return (
      <form action={createAction} className="space-y-2">
        <FormError state={createState} />
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32 space-y-1.5">
            <Label htmlFor={`amount-${variantLabel}`}>Price</Label>
            <Input
              id={`amount-${variantLabel}`}
              name="amount"
              inputMode="decimal"
              placeholder="549.00"
              required
            />
          </div>
          <div className="w-24 space-y-1.5">
            <Label htmlFor={`currency-${variantLabel}`}>Currency</Label>
            <Input
              id={`currency-${variantLabel}`}
              name="currency"
              defaultValue="GBP"
              maxLength={3}
              className="uppercase"
            />
          </div>
          <SubmitButton pendingLabel="Creating…">
            Create and publish offer
          </SubmitButton>
        </div>
        <FieldError messages={createState.fieldErrors?.amount} />
      </form>
    );
  }

  return (
    <div className="space-y-3">
      {offers.map((offer) => (
        <OfferRow
          key={offer.id}
          offer={offer}
          addPrice={addPrice}
          setStatus={setOfferStatus}
        />
      ))}
    </div>
  );
}

function OfferRow({
  offer,
  addPrice,
  setStatus,
}: {
  offer: OfferSummary;
  addPrice: (state: FormState, formData: FormData) => Promise<FormState>;
  setStatus: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [priceState, priceAction] = useActionState(addPrice, idleFormState);

  return (
    <div className="bg-muted/40 space-y-2 rounded-lg p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-medium">
            {offer.prices.length > 0
              ? offer.prices.join(' · ')
              : 'No price yet'}
          </span>
          <span className="text-muted-foreground"> · offer</span>
        </p>
        <StatusControl
          current={offer.status}
          label={`offer-${offer.id}`}
          action={setStatus}
          hidden={{ offerId: offer.id }}
        />
      </div>

      <form action={priceAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="offerId" value={offer.id} />
        <div className="w-32 space-y-1.5">
          <Label htmlFor={`newprice-${offer.id}`}>New price</Label>
          <Input
            id={`newprice-${offer.id}`}
            name="amount"
            inputMode="decimal"
            placeholder="549.00"
            required
          />
        </div>
        <div className="w-24 space-y-1.5">
          <Label htmlFor={`newcur-${offer.id}`}>Currency</Label>
          <Input
            id={`newcur-${offer.id}`}
            name="currency"
            defaultValue="GBP"
            maxLength={3}
            className="uppercase"
          />
        </div>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Add price
        </SubmitButton>
        <FormError state={priceState} />
        <FieldError messages={priceState.fieldErrors?.amount} />
      </form>
    </div>
  );
}
