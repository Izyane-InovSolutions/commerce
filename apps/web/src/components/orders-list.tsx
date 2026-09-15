import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { OfferLabel } from '@/lib/cart';
import { formatMinor } from '@/lib/currency';
import type { Order } from '@/lib/commerce-types';

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Refunded',
};

/** Says why an order is still waiting, when the payment explains it. */
function paymentNote(order: Order): string | null {
  if (order.payment?.failureReason) {
    return order.payment.failureReason;
  }

  return order.status === 'PENDING_PAYMENT' &&
    order.payment?.status === 'PENDING'
    ? 'Your payment is processing. The order status will update automatically.'
    : null;
}

/** Shared by the standalone orders page and the account page's Orders tab. */
export function OrdersList({
  orders,
  labels,
}: {
  orders: Order[];
  labels: Map<string, OfferLabel>;
}) {
  if (orders.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">No orders yet</p>
        <p className="text-muted-foreground text-sm">
          Anything you buy shows up here.
        </p>
        <Button asChild size="sm">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {orders.map((order) => (
        <li key={order.id}>
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs">{order.id.slice(0, 8)}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(order.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <Badge variant={order.status === 'PAID' ? 'default' : 'secondary'}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </Badge>
              </div>

              {paymentNote(order) ? (
                <p className="text-muted-foreground text-xs text-pretty">
                  {paymentNote(order)}
                </p>
              ) : null}

              <ul className="space-y-2">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {labels.get(item.offerId)?.name ?? 'Item'} × {item.quantity}
                    </span>
                    <span>{formatMinor(item.lineTotal, item.currency)}</span>
                  </li>
                ))}
              </ul>

              <Separator />

              <div className="flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{formatMinor(order.total, order.currency)}</span>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
