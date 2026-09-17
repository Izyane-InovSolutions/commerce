'use client';

import { useState } from 'react';

import { CheckoutCostSummary, type CheckoutQuoteResult } from '@/components/checkout-cost-summary';
import { CheckoutForm } from '@/components/checkout-form';
import { Card, CardContent } from '@/components/ui/card';
import type { Address } from '@/lib/commerce-types';
import { formatMinor } from '@/lib/currency';
import type { FormState } from '@/lib/form';

/**
 * The address/payment form and the order summary, sharing which address is
 * selected.
 *
 * Split out of `CheckoutContent` (which stays a server component, since it
 * resolves offer names from a `Map` that cannot cross into a client one) so
 * the summary can re-quote shipping the moment the shopper picks a different
 * address, rather than only finding out what it costs after they pay.
 */
export function CheckoutPanel({
  addresses,
  currency,
  placeOrder,
  getQuote,
  items,
  subtotal,
  itemIds,
  leftInCart,
}: {
  addresses: Address[];
  currency: string;
  placeOrder: (state: FormState, formData: FormData) => Promise<FormState>;
  getQuote: (input: {
    shippingAddressId: string;
    currency: string;
    itemIds: string[];
  }) => Promise<CheckoutQuoteResult>;
  items: { id: string; name: string; quantity: number; lineTotal: number }[];
  subtotal: number;
  itemIds: string[];
  leftInCart: number;
}) {
  const defaultAddress =
    addresses.find((address) => address.isDefault) ?? addresses[0];
  // Not initialized from `defaultAddress` directly: falling back to it on
  // every render, rather than only at mount, keeps this in sync even if
  // `addresses` populates after this component already exists.
  const [chosenAddressId, setChosenAddressId] = useState<
    string | undefined
  >(undefined);
  const selectedAddressId = chosenAddressId ?? defaultAddress?.id;

  return (
    <>
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
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex justify-between gap-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {item.name} × {item.quantity}
                </span>
                <span className="font-medium">
                  {formatMinor(item.lineTotal, currency)}
                </span>
              </li>
            ))}
          </ul>

          <CheckoutCostSummary
            subtotal={subtotal}
            currency={currency}
            selectedAddressId={selectedAddressId}
            itemIds={itemIds}
            getQuote={getQuote}
            footnote={
              <>
                {leftInCart > 0 ? (
                  <p className="text-muted-foreground text-xs text-pretty">
                    {leftInCart} other item{leftInCart === 1 ? '' : 's'} left
                    in your cart, not part of this order.
                  </p>
                ) : null}
                <p className="text-muted-foreground text-xs text-pretty">
                  If the payment provider cannot be reached, the order is
                  cancelled and your cart is left as it is.
                </p>
              </>
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
