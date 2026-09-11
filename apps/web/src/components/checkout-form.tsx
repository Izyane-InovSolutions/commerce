'use client';

import { useState, type FormEvent } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  formatCardNumber,
  formatCvc,
  formatExpiry,
  formatZambianPhone,
} from '@/lib/input-format';

type PaymentMethod = 'card' | 'mobile-money';

/** Shared with the submit button, which lives outside this form in the DOM
 * (below the order summary) but submits it via the `form` attribute. */
export const CHECKOUT_FORM_ID = 'checkout-form';

export function CheckoutForm({ onPlaced }: { onPlaced: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [momoPhone, setMomoPhone] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onPlaced();
  }

  return (
    <form id={CHECKOUT_FORM_ID} onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Payment method</legend>
        <RadioGroup
          value={method}
          onValueChange={(value) => setMethod(value as PaymentMethod)}
        >
          <div className="flex items-center gap-3 rounded-lg border border-input px-3 py-2.5">
            <RadioGroupItem value="card" id="payment-card" />
            <Label htmlFor="payment-card" className="flex-1">
              Card
            </Label>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-input px-3 py-2.5">
            <RadioGroupItem value="mobile-money" id="payment-mobile-money" />
            <Label htmlFor="payment-mobile-money" className="flex-1">
              Mobile Money
            </Label>
          </div>
        </RadioGroup>
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
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              required
            >
              <option>MTN Money</option>
              <option>Airtel Money</option>
              <option>Zamtel Kwacha</option>
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
          </div>
        </div>
      )}
    </form>
  );
}
