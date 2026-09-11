'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { formatCurrency } from '@/lib/currency';

type PaymentMethod = 'card' | 'mobile-money';

export function CheckoutForm({ total }: { total: number }) {
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [placed, setPlaced] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlaced(true);
  }

  if (placed) {
    return (
      <div className="space-y-2 rounded-2xl border border-dashed p-8 text-center">
        <p className="text-lg font-semibold">Order placed</p>
        <p className="text-muted-foreground text-sm">
          This is a demo checkout, so no payment was actually charged. Real
          payments arrive with Phase 1.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
              placeholder="4242 4242 4242 4242"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-expiry">Expiry</Label>
            <Input
              id="card-expiry"
              name="cardExpiry"
              placeholder="MM/YY"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-cvc">CVC</Label>
            <Input
              id="card-cvc"
              name="cardCvc"
              inputMode="numeric"
              placeholder="123"
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
              placeholder="097 123 4567"
              required
            />
          </div>
        </div>
      )}

      <Button type="submit" className="w-full sm:w-auto">
        Pay {formatCurrency(total)}
      </Button>
    </form>
  );
}
