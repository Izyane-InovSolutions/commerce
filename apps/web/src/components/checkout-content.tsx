import Link from 'next/link';

import { AddressForm } from '@/components/address-form';
import { CHECKOUT_FORM_ID, CheckoutForm } from '@/components/checkout-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { OfferLabel } from '@/lib/cart';
import type { Address, CartView } from '@/lib/commerce-types';
import { formatMinor } from '@/lib/currency';
import type { FormState } from '@/lib/form';

/**
 * Checkout: what is being bought, where it goes, and how it is paid for.
 *
 * An empty cart and an account with no address are both dead ends rather than
 * errors, so each gets its own answer instead of a form that cannot succeed.
 */
export function CheckoutContent({
  cart,
  labels,
  addresses,
  selectedItemIds,
  placeOrder,
  createAddress,
}: {
  cart: CartView;
  labels: Map<string, OfferLabel>;
  addresses: Address[];
  /**
   * Which cart lines to check out with, as chosen on the cart page. Null
   * means none were specified — every currently available line, same as
   * checkout worked before selection existed.
   */
  selectedItemIds: string[] | null;
  placeOrder: (state: FormState, formData: FormData) => Promise<FormState>;
  createAddress: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  if (cart.items.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">Your cart is empty</p>
        <p className="text-muted-foreground text-sm">
          Add products to your cart before checking out.
        </p>
        <Button asChild size="sm">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  const currency = cart.currency ?? 'ZMW';

  // An out-of-stock line can never be selected, whether or not it was named
  // in the query — the cart page never offers it, and a stale/shared link
  // must not resurrect it either.
  const availableIds = new Set(
    cart.items.filter((line) => line.isAvailable).map((line) => line.id),
  );
  const selected = selectedItemIds
    ? new Set(selectedItemIds.filter((id) => availableIds.has(id)))
    : availableIds;
  const selectedLines = cart.items.filter((line) => selected.has(line.id));
  const subtotal = selectedLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const leftInCart = cart.items.length - selectedLines.length;

  if (selectedLines.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">Nothing selected to check out</p>
        <p className="text-muted-foreground text-sm text-pretty">
          Go back to your cart and select at least one item that is in stock.
        </p>
        <Button asChild size="sm">
          <Link href="/cart">Back to cart</Link>
        </Button>
      </div>
    );
  }

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
      />

      {selectedLines.map((line) => (
        <input
          key={line.id}
          type="hidden"
          name="itemIds"
          value={line.id}
          form={CHECKOUT_FORM_ID}
        />
      ))}

      <Card className="h-fit">
        <CardContent className="space-y-4">
          <h2 className="text-base font-semibold">Order summary</h2>
          <ul className="space-y-3">
            {selectedLines.map((line) => (
              <li key={line.id} className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {labels.get(line.offerId)?.name ?? 'Item'} × {line.quantity}
                </span>
                <span className="font-medium">
                  {formatMinor(line.lineTotal, currency)}
                </span>
              </li>
            ))}
          </ul>
          <Separator />
          <div className="flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span>{formatMinor(subtotal, currency)}</span>
          </div>
          <Button type="submit" form={CHECKOUT_FORM_ID} className="w-full">
            Pay {formatMinor(subtotal, currency)}
          </Button>
          {leftInCart > 0 ? (
            <p className="text-muted-foreground text-xs text-pretty">
              {leftInCart} other item{leftInCart === 1 ? '' : 's'} left in your
              cart, not part of this order.
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs text-pretty">
            If the payment provider cannot be reached, the order is cancelled
            and your cart is left as it is.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
