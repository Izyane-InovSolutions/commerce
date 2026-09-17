'use client';

import { useState } from 'react';

import { AddressForm } from '@/components/address-form';
import { CheckoutCostSummary, type CheckoutQuoteResult } from '@/components/checkout-cost-summary';
import { CheckoutForm } from '@/components/checkout-form';
import { ProductImage } from '@/components/product-image';
import { Card, CardContent } from '@/components/ui/card';
import type { Address } from '@/lib/commerce-types';
import { formatMinor } from '@/lib/currency';
import type { FormState } from '@/lib/form';

/**
 * Checkout for one product, bought directly rather than through the cart.
 *
 * Structurally the same as the cart's checkout (same address step, same
 * `CheckoutForm`, same shipping-aware cost summary) — only the order summary
 * differs, since there is exactly one line to show instead of whatever the
 * cart holds.
 */
export function BuyNowContent({
  name,
  imageUrl,
  quantity,
  unitAmount,
  currency,
  addresses,
  placeOrder,
  createAddress,
  getQuote,
}: {
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitAmount: number;
  currency: string;
  addresses: Address[];
  placeOrder: (state: FormState, formData: FormData) => Promise<FormState>;
  createAddress: (state: FormState, formData: FormData) => Promise<FormState>;
  getQuote: (input: {
    shippingAddressId: string;
    currency: string;
    itemIds: string[];
  }) => Promise<CheckoutQuoteResult>;
}) {
  const subtotal = unitAmount * quantity;
  const defaultAddress =
    addresses.find((address) => address.isDefault) ?? addresses[0];
  // Not initialized from `defaultAddress` directly: when this page starts
  // with no addresses at all, the shopper adds one inline without this
  // component ever remounting, and a `useState` initializer would never see
  // it. Falling back to `defaultAddress` on every render instead keeps this
  // in sync with a prop that can populate after the fact.
  const [chosenAddressId, setChosenAddressId] = useState<
    string | undefined
  >(undefined);
  const selectedAddressId = chosenAddressId ?? defaultAddress?.id;

  if (addresses.length === 0) {
    return (
      <div className="max-w-xl space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Add a delivery address</h2>
          <p className="text-muted-foreground text-sm text-pretty">
            An order needs somewhere to go. This is saved to your account, so
            you only do it once.
          </p>
        </div>
        <AddressForm action={createAddress} />
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <CheckoutForm
        addresses={addresses}
        currency={currency}
        placeOrder={placeOrder}
        selectedAddressId={selectedAddressId}
        onAddressChange={setChosenAddressId}
      />

      <Card className="h-fit">
        <CardContent className="space-y-4">
          <h2 className="text-base font-semibold">Order summary</h2>
          <div className="flex items-center gap-3 text-sm">
            <ProductImage
              src={imageUrl}
              alt={name}
              sizes="48px"
              className="size-12 shrink-0 rounded-lg"
              iconClassName="size-5"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{name}</p>
              <p className="text-muted-foreground">Qty {quantity}</p>
            </div>
            <span className="font-medium">
              {formatMinor(subtotal, currency)}
            </span>
          </div>

          <CheckoutCostSummary
            subtotal={subtotal}
            currency={currency}
            selectedAddressId={selectedAddressId}
            itemIds={[]}
            getQuote={getQuote}
            footnote={
              <p className="text-muted-foreground text-xs text-pretty">
                If the payment provider cannot be reached, the order is
                cancelled and nothing is charged.
              </p>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
