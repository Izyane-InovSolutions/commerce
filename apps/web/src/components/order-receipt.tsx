import type { ReactNode } from 'react';
import Link from 'next/link';

import { ProductImage } from '@/components/product-image';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { OfferLabel } from '@/lib/cart';
import type { Order, OrderItem } from '@/lib/commerce-types';
import { formatMinor } from '@/lib/currency';

/**
 * An order's lines, totals and delivery address — the receipt shared by the
 * confirmation page and the order page.
 *
 * A server component, so it can read names off `labels` (a `Map`) directly.
 * `itemExtra` lets the order page hang per-line actions (review, return
 * status) under each line without this knowing about them.
 */
export function OrderReceipt({
  order,
  labels,
  itemExtra,
}: {
  order: Order;
  labels: Map<string, OfferLabel>;
  itemExtra?: (item: OrderItem) => ReactNode;
}) {
  const address = order.shippingAddress ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-base font-semibold">Items</h2>
          <ul className="space-y-4">
            {order.items.map((item) => {
              const label = labels.get(item.offerId);
              const name = label?.name ?? 'Item';
              return (
                <li key={item.id} className="flex items-start gap-4">
                  <ProductImage
                    src={label?.imageUrl ?? null}
                    alt={name}
                    sizes="56px"
                    className="size-14 shrink-0 rounded-lg"
                    iconClassName="size-5"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
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
                    <p className="text-muted-foreground text-xs">
                      {item.quantity} ×{' '}
                      {formatMinor(item.unitAmount, item.currency)}
                      {label?.sellerName ? ` · Sold by ${label.sellerName}` : ''}
                    </p>
                    {itemExtra ? itemExtra(item) : null}
                  </div>
                  <span className="text-sm font-medium">
                    {formatMinor(item.lineTotal, item.currency)}
                  </span>
                </li>
              );
            })}
          </ul>

          <Separator />

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatMinor(order.subtotal, order.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>
                {order.shippingAmount === 0
                  ? 'Free'
                  : formatMinor(order.shippingAmount, order.currency)}
              </span>
            </div>
          </div>

          <Separator />

          <div className="flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span>{formatMinor(order.total, order.currency)}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardContent className="space-y-2">
          <h2 className="text-base font-semibold">Delivering to</h2>
          {address ? (
            <address className="text-muted-foreground text-sm not-italic">
              <span className="text-foreground block font-medium">
                {address.recipientName}
              </span>
              {[address.line1, address.line2].filter(Boolean).join(', ')}
              <br />
              {[address.city, address.region, address.postalCode]
                .filter(Boolean)
                .join(', ')}
              <br />
              {address.country}
              {address.phone ? (
                <>
                  <br />
                  {address.phone}
                </>
              ) : null}
            </address>
          ) : (
            <p className="text-muted-foreground text-sm">
              Address not available.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
