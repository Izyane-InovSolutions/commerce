import { AddressForm } from '@/components/address-form';
import { CHECKOUT_FORM_ID, CheckoutForm } from '@/components/checkout-form';
import { ProductImage } from '@/components/product-image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { Address } from '@/lib/commerce-types';
import { formatMinor } from '@/lib/currency';
import type { FormState } from '@/lib/form';

/**
 * Checkout for one product, bought directly rather than through the cart.
 *
 * Structurally the same as the cart's checkout (same address step, same
 * `CheckoutForm`) — only the order summary differs, since there is exactly
 * one line to show instead of whatever the cart holds.
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
}: {
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitAmount: number;
  currency: string;
  addresses: Address[];
  placeOrder: (state: FormState, formData: FormData) => Promise<FormState>;
  createAddress: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const total = unitAmount * quantity;

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
            <span className="font-medium">{formatMinor(total, currency)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span>{formatMinor(total, currency)}</span>
          </div>
          <Button type="submit" form={CHECKOUT_FORM_ID} className="w-full">
            Pay {formatMinor(total, currency)}
          </Button>
          <p className="text-muted-foreground text-xs text-pretty">
            If the payment provider cannot be reached, the order is cancelled
            and nothing is charged.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
