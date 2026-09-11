import Link from 'next/link';
import { PackageSearch } from 'lucide-react';

import { CartLineControls } from '@/components/cart-line-controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { CartView, PublicOffer } from '@/lib/commerce-types';
import { formatMinor } from '@/lib/currency';

import { removeCartItemAction, updateCartItemAction } from '@/app/cart/actions';

/**
 * The cart as the API holds it.
 *
 * A line names only the offer it holds, so titles come from `offers` — read
 * separately. A line whose offer could not be read still shows: the quantity
 * and what it costs are on the line itself.
 */
export function CartContents({
  cart,
  offers,
}: {
  cart: CartView;
  offers: Map<string, PublicOffer>;
}) {
  if (cart.items.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">Your cart is empty</p>
        <p className="text-muted-foreground text-sm">
          Add products from the catalog to see them here.
        </p>
        <Button asChild size="sm">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  const currency = cart.currency ?? 'ZMW';
  const unavailable = cart.items.filter((line) => !line.isAvailable);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <ul className="space-y-4">
        {cart.items.map((line) => {
          const offer = offers.get(line.offerId);
          const name =
            offer?.listingTitle ??
            (offer ? 'Catalog item' : 'Unavailable item');

          return (
            <li key={line.id}>
              <Card>
                <CardContent className="flex items-center gap-4">
                  <div className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-lg">
                    <PackageSearch
                      className="text-muted-foreground size-6"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-muted-foreground text-sm">
                        {line.unitPrice
                          ? `${formatMinor(line.unitPrice.amount, line.unitPrice.currency)} each`
                          : 'No current price'}
                      </p>
                      {line.isAvailable ? null : (
                        <p className="text-destructive text-xs">
                          Not available right now — remove it to check out.
                        </p>
                      )}
                    </div>
                    <CartLineControls
                      quantity={line.quantity}
                      update={updateCartItemAction.bind(null, line.id)}
                      remove={removeCartItemAction.bind(null, line.id)}
                    />
                  </div>
                  <span className="text-sm font-semibold">
                    {formatMinor(line.lineTotal, currency)}
                  </span>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <Card className="h-fit">
        <CardContent className="space-y-4">
          <h2 className="text-base font-semibold">Order summary</h2>
          <ul className="space-y-3">
            {cart.items.map((line) => (
              <li key={line.id} className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {offers.get(line.offerId)?.listingTitle ?? 'Item'} ×{' '}
                  {line.quantity}
                </span>
                <span className="font-medium">
                  {formatMinor(line.lineTotal, currency)}
                </span>
              </li>
            ))}
          </ul>
          <Separator />
          <div className="flex justify-between text-sm font-semibold">
            <span>Subtotal</span>
            <span>{formatMinor(cart.subtotal, currency)}</span>
          </div>
          <p className="text-muted-foreground text-xs text-pretty">
            The subtotal counts only the lines that are still available.
          </p>
          <Button
            asChild={unavailable.length === 0}
            disabled={unavailable.length > 0}
            className="w-full"
          >
            {unavailable.length === 0 ? (
              <Link href="/checkout">Proceed to checkout</Link>
            ) : (
              <span>Remove unavailable items to continue</span>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
