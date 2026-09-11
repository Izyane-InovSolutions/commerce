'use client';

import { useActionState, useMemo, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { Address } from '@/lib/commerce-types';
import { idleFormState, type FormState } from '@/lib/form';
import {
  availablePaymentMethods,
  unavailableReason,
  type PaymentMethod,
} from '@/lib/payment-methods';
import {
  formatCardNumber,
  formatCvc,
  formatExpiry,
  formatZambianPhone,
} from '@/lib/input-format';

/** Shared with the submit button, which lives outside this form in the DOM
 * (below the order summary) but submits it via the `form` attribute. */
export const CHECKOUT_FORM_ID = 'checkout-form';

/**
 * Delivery address and payment.
 *
 * The card and mobile-money fields are posted to a server action, which hands
 * them to the API — they never touch this app's own storage. Billing details
 * the gateway needs are derived from the chosen address rather than asked for
 * twice.
 */
export function CheckoutForm({
  addresses,
  currency,
  placeOrder,
}: {
  addresses: Address[];
  /** The order's currency, which decides how it can be paid for. */
  currency: string;
  placeOrder: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const available = availablePaymentMethods(currency);
  const [state, formAction] = useActionState(placeOrder, idleFormState);
  const [method, setMethod] = useState<PaymentMethod>(
    available[0] ?? 'mobile-money',
  );
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [momoPhone, setMomoPhone] = useState('');

  // Minted once per mounted form, so a double submit or a retry after a
  // timeout is the same checkout rather than a second order.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const defaultAddress =
    addresses.find((address) => address.isDefault) ?? addresses[0];

  return (
    <form id={CHECKOUT_FORM_ID} action={formAction} className="space-y-6">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="paymentMethod" value={method} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Deliver to</legend>
        <RadioGroup
          name="shippingAddressId"
          defaultValue={defaultAddress?.id}
          required
        >
          {addresses.map((address) => (
            <div
              key={address.id}
              className="border-input flex items-start gap-3 rounded-lg border px-3 py-2.5"
            >
              <RadioGroupItem
                value={address.id}
                id={`address-${address.id}`}
                className="mt-1"
              />
              <Label
                htmlFor={`address-${address.id}`}
                className="flex-1 font-normal"
              >
                <span className="block font-medium">
                  {address.recipientName}
                </span>
                <span className="text-muted-foreground block text-sm">
                  {[address.line1, address.line2, address.city, address.country]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        <FieldError messages={state.fieldErrors?.shippingAddressId} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Payment method</legend>
        <RadioGroup
          value={method}
          onValueChange={(value) => setMethod(value as PaymentMethod)}
        >
          {available.includes('mobile-money') ? (
            <div className="border-input flex items-center gap-3 rounded-lg border px-3 py-2.5">
              <RadioGroupItem value="mobile-money" id="payment-mobile-money" />
              <Label htmlFor="payment-mobile-money" className="flex-1">
                Mobile Money
              </Label>
            </div>
          ) : null}
          {available.includes('card') ? (
            <div className="border-input flex items-center gap-3 rounded-lg border px-3 py-2.5">
              <RadioGroupItem value="card" id="payment-card" />
              <Label htmlFor="payment-card" className="flex-1">
                Card
              </Label>
            </div>
          ) : null}
        </RadioGroup>

        {available.includes('card') ? null : (
          <p className="text-muted-foreground text-xs text-pretty">
            {unavailableReason('card', currency)}
          </p>
        )}
        {available.includes('mobile-money') ? null : (
          <p className="text-muted-foreground text-xs text-pretty">
            {unavailableReason('mobile-money', currency)}
          </p>
        )}
      </fieldset>

      {method === 'card' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="card-name">Name on card</Label>
            <Input
              id="card-name"
              name="cardName"
              autoComplete="cc-name"
              placeholder="Jane Mwanza"
              required
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="card-number">Card number</Label>
            <Input
              id="card-number"
              name="cardNumber"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              pattern="\d{4} \d{4} \d{4} \d{4}"
              title="16 digits"
              maxLength={19}
              value={cardNumber}
              onChange={(event) =>
                setCardNumber(formatCardNumber(event.target.value))
              }
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-expiry">Expiry</Label>
            <Input
              id="card-expiry"
              name="cardExpiry"
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              pattern="\d{2}/\d{2}"
              title="MM/YY"
              maxLength={5}
              value={cardExpiry}
              onChange={(event) =>
                setCardExpiry((previous) =>
                  formatExpiry(event.target.value, previous),
                )
              }
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-cvc">CVC</Label>
            <Input
              id="card-cvc"
              name="cardCvc"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              pattern="\d{3}"
              title="3 digits"
              maxLength={3}
              value={cardCvc}
              onChange={(event) => setCardCvc(formatCvc(event.target.value))}
              required
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="momo-provider">Mobile network</Label>
            <select
              id="momo-provider"
              name="momoProvider"
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
            >
              {/* The gateway reads the network off the number and says to set
                  this only to override it, so the default leaves it alone. */}
              <option value="">Detect from my number</option>
              <option value="MTN">MTN Money</option>
              <option value="AIRTEL">Airtel Money</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="momo-phone">Mobile money number</Label>
            <Input
              id="momo-phone"
              name="momoPhone"
              type="tel"
              inputMode="numeric"
              placeholder="097 123 4567"
              pattern="0\d{2} \d{3} \d{4}"
              title="10 digits, starting with 0"
              maxLength={12}
              value={momoPhone}
              onChange={(event) =>
                setMomoPhone(formatZambianPhone(event.target.value))
              }
              required
            />
            <FieldError messages={state.fieldErrors?.phoneNumber} />
          </div>
        </div>
      )}

      <FormError state={state} />
    </form>
  );
}
