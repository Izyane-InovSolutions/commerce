import Link from 'next/link';

import { AddressForm } from '@/components/address-form';
import { CHECKOUT_FORM_ID } from '@/components/checkout-form';
import { CheckoutPanel } from '@/components/checkout-panel';
import type { CheckoutQuoteResult } from '@/components/checkout-cost-summary';
import { Button } from '@/components/ui/button';
import type { OfferLabel } from '@/lib/cart';
import type { Address, CartView } from '@/lib/commerce-types';
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
  getQuote,
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
  getQuote: (input: {
    shippingAddressId: string;
    currency: string;
    itemIds: string[];
  }) => Promise<CheckoutQuoteResult>;
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

  const itemIds = selectedLines.map((line) => line.id);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <CheckoutPanel
        addresses={addresses}
        currency={currency}
        placeOrder={placeOrder}
        getQuote={getQuote}
        items={selectedLines.map((line) => ({
          id: line.id,
          name: labels.get(line.offerId)?.name ?? 'Item',
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        }))}
        subtotal={subtotal}
        itemIds={itemIds}
        leftInCart={leftInCart}
      />

      {itemIds.map((id) => (
        <input
          key={id}
          type="hidden"
          name="itemIds"
          value={id}
          form={CHECKOUT_FORM_ID}
        />
      ))}
    </div>
  );
}
