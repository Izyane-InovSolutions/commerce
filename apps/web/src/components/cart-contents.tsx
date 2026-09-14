'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { CartLineControls } from '@/components/cart-line-controls';
import { ProductImage } from '@/components/product-image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import type { OfferLabel } from '@/lib/cart';
import type { CartView } from '@/lib/commerce-types';
import { formatMinor } from '@/lib/currency';
import { cn } from '@/lib/utils';

import { removeCartItemAction, updateCartItemAction } from '@/app/cart/actions';

/**
 * The cart as the API holds it.
 *
 * A line names only the offer it holds, so names come from `labels` — resolved
 * separately. A line whose offer could not be read still shows: the quantity
 * and what it costs are on the line itself.
 *
 * Which lines to check out with is chosen here, not assumed to be "the whole
 * cart" — a shopper can leave something in the cart for later. An
 * out-of-stock line is never selectable: it starts unselected and stays that
 * way regardless of what else changes, so it can never sneak into a total.
 */
export function CartContents({
  cart,
  labels,
}: {
  cart: CartView;
  /**
   * A plain object, not a `Map` — this is a client component, and a `Map`
   * cannot cross the server/client boundary as a prop.
   */
  labels: Record<string, OfferLabel>;
}) {
  const availableIds = useMemo(
    () =>
      cart.items.filter((line) => line.isAvailable).map((line) => line.id),
    [cart.items],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(availableIds),
  );

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
  const subtotal = cart.items
    .filter((line) => line.isAvailable && selected.has(line.id))
    .reduce((sum, line) => sum + line.lineTotal, 0);

  function setLineSelected(id: string, isSelected: boolean): void {
    setSelected((previous) => {
      const next = new Set(previous);
      if (isSelected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  const checkoutHref = `/checkout?items=${[...selected]
    .map(encodeURIComponent)
    .join(',')}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <ul className="space-y-4">
        {cart.items.map((line) => {
          const label = labels[line.offerId];
          const name = label?.name ?? 'Item';
          const isChecked = line.isAvailable && selected.has(line.id);

          return (
            <li key={line.id}>
              <Card>
                <CardContent className="flex items-start gap-4">
                  <Checkbox
                    checked={isChecked}
                    disabled={!line.isAvailable}
                    onCheckedChange={(checked) =>
                      setLineSelected(line.id, checked === true)
                    }
                    aria-label={`Include ${name} in checkout`}
                    className="mt-1"
                  />
                  <ProductImage
                    src={label?.imageUrl ?? null}
                    alt={name}
                    sizes="64px"
                    className="size-16 shrink-0 rounded-lg"
                    iconClassName="size-6"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-sm font-medium">
                        {label?.slug ? (
                          <Link
                            href={`/products/${label.slug}`}
                            className="hover:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {line.unitPrice
                          ? `${formatMinor(line.unitPrice.amount, line.unitPrice.currency)} each`
                          : 'No current price'}
                      </p>
                      {line.isAvailable ? null : (
                        <p className="text-destructive text-xs text-pretty">
                          {line.unitPrice === null && line.currencies.length > 0
                            ? `Not sold in ${currency} — priced in ${line.currencies.join(' and ')}. Switch currency to buy it.`
                            : 'Out of stock — left out of checkout automatically.'}
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
            {cart.items.map((line) => {
              const included = line.isAvailable && selected.has(line.id);
              return (
                <li
                  key={line.id}
                  className={cn(
                    'flex justify-between gap-3 text-sm',
                    !included && 'text-muted-foreground/60',
                  )}
                >
                  <span
                    className={cn(!included && 'line-through', 'truncate')}
                  >
                    {labels[line.offerId]?.name ?? 'Item'} ×{' '}
                    {line.quantity}
                  </span>
                  <span
                    className={cn(
                      'font-medium',
                      !included && 'line-through',
                    )}
                  >
                    {formatMinor(line.lineTotal, currency)}
                  </span>
                </li>
              );
            })}
          </ul>
          <Separator />
          <div className="flex justify-between text-sm font-semibold">
            <span>Subtotal</span>
            <span>{formatMinor(subtotal, currency)}</span>
          </div>
          <p className="text-muted-foreground text-xs text-pretty">
            Select which items to check out with — out-of-stock items are
            left out automatically, and the subtotal only counts what is
            selected.
          </p>
          <Button
            asChild={selected.size > 0}
            disabled={selected.size === 0}
            className="w-full"
          >
            {selected.size > 0 ? (
              <Link href={checkoutHref}>Proceed to checkout</Link>
            ) : (
              <span>Select at least one item</span>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
