'use client';

import { useActionState } from 'react';

import { DeleteControl } from '@/components/delete-control';
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
  /** Formatted, e.g. "K25.00 shipping" — null once none has been set. */
  shipping: string | null;
  /**
   * A seller's offer, listed so the variant's whole picture is visible. The
   * API refuses every admin write to one — it belongs to the seller's own
   * workflow — so no controls are offered for it.
   */
  sellerOwned: boolean;
  /** Every price ever set, newest first, already formatted. */
  history: { id: string; price: string; window: string; current: boolean }[];
  /** Bound to this offer on the server; absent for a seller's offer. */
  remove?: () => Promise<FormState>;
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
  setOfferShipping,
}: {
  productId: string;
  variantId: string;
  variantLabel: string;
  offers: OfferSummary[];
  createOffer: (state: FormState, formData: FormData) => Promise<FormState>;
  addPrice: (state: FormState, formData: FormData) => Promise<FormState>;
  setOfferStatus: (state: FormState, formData: FormData) => Promise<FormState>;
  setOfferShipping: (
    state: FormState,
    formData: FormData,
  ) => Promise<FormState>;
}) {
  const [createState, createAction] = useActionState(
    createOffer,
    idleFormState,
  );

  // A seller's offer doesn't stand in for the platform's own, so the create
  // form stays until the variant has a platform offer of its own.
  const createForm = offers.some((offer) => !offer.sellerOwned) ? null : (
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
            defaultValue="ZMW"
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

  return (
    <div className="space-y-3">
      {offers.map((offer) => (
        <OfferRow
          key={offer.id}
          offer={offer}
          addPrice={addPrice}
          setStatus={setOfferStatus}
          setShipping={setOfferShipping}
        />
      ))}
      {createForm}
    </div>
  );
}

function OfferRow({
  offer,
  addPrice,
  setStatus,
  setShipping,
}: {
  offer: OfferSummary;
  addPrice: (state: FormState, formData: FormData) => Promise<FormState>;
  setStatus: (state: FormState, formData: FormData) => Promise<FormState>;
  setShipping: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [priceState, priceAction] = useActionState(addPrice, idleFormState);
  const [shippingState, shippingAction] = useActionState(
    setShipping,
    idleFormState,
  );

  const summary = (
    <p className="text-sm">
      <span className="font-medium">
        {offer.prices.length > 0 ? offer.prices.join(' · ') : 'No price yet'}
      </span>
      <span className="text-muted-foreground">
        {offer.sellerOwned ? ' · seller offer' : ' · offer'}
        {/* A platform offer shows its shipping cost on the form below. */}
        {offer.sellerOwned && offer.shipping
          ? ` · ${offer.shipping} shipping`
          : ''}
      </span>
    </p>
  );

  const history =
    offer.history.length > 0 ? (
      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer text-xs">
          Price history ({offer.history.length})
        </summary>
        <ul className="mt-2 space-y-1">
          {offer.history.map((entry) => (
            <li key={entry.id} className="flex flex-wrap gap-x-3">
              <span className="font-medium tabular-nums">{entry.price}</span>
              <span className="text-muted-foreground">{entry.window}</span>
              {entry.current ? (
                <span className="text-xs font-medium">In force</span>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    ) : null;

  if (offer.sellerOwned) {
    return (
      <div className="bg-muted/40 space-y-2 rounded-lg p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {summary}
          <span className="text-muted-foreground text-xs">
            {offer.status.toLowerCase()} · managed by the seller
          </span>
        </div>
        {history}
      </div>
    );
  }

  return (
    <div className="bg-muted/40 space-y-2 rounded-lg p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {summary}
        <div className="flex flex-wrap items-start gap-3">
          <StatusControl
            current={offer.status}
            label={`offer-${offer.id}`}
            action={setStatus}
            hidden={{ offerId: offer.id }}
          />
          {offer.remove ? (
            <DeleteControl
              action={offer.remove}
              label="Delete offer"
              confirmLabel="this offer and its prices"
            />
          ) : null}
        </div>
      </div>

      {history}

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
            defaultValue="ZMW"
            maxLength={3}
            className="uppercase"
          />
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor={`saleuntil-${offer.id}`}>Sale until</Label>
          <Input
            id={`saleuntil-${offer.id}`}
            name="saleUntil"
            type="date"
            aria-describedby={`saleuntil-hint-${offer.id}`}
          />
        </div>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Add price
        </SubmitButton>
        <FormError state={priceState} />
        <FieldError messages={priceState.fieldErrors?.amount} />
        <FieldError messages={priceState.fieldErrors?.saleUntil} />
        {priceState.status === 'idle' && priceState.message ? (
          <span className="text-muted-foreground text-xs" role="status">
            {priceState.message}
          </span>
        ) : null}
        <p
          id={`saleuntil-hint-${offer.id}`}
          className="text-muted-foreground w-full text-xs"
        >
          Leave “Sale until” blank to change the price. Set a date to run a
          sale: a lower price shows in Hot deals with the current price as
          “was”, and the current price comes back after that day.
        </p>
      </form>

      <form action={shippingAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="offerId" value={offer.id} />
        <div className="w-32 space-y-1.5">
          <Label htmlFor={`shipping-${offer.id}`}>
            Shipping cost{offer.shipping ? ` (${offer.shipping})` : ''}
          </Label>
          <Input
            id={`shipping-${offer.id}`}
            name="shippingAmount"
            inputMode="decimal"
            placeholder="Blank = none"
          />
        </div>
        <div className="w-24 space-y-1.5">
          <Label htmlFor={`shippingcur-${offer.id}`}>Currency</Label>
          <Input
            id={`shippingcur-${offer.id}`}
            name="shippingCurrency"
            defaultValue="ZMW"
            maxLength={3}
            className="uppercase"
          />
        </div>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save shipping cost
        </SubmitButton>
        <FormError state={shippingState} />
        <FieldError messages={shippingState.fieldErrors?.shippingAmount} />
      </form>
    </div>
  );
}
