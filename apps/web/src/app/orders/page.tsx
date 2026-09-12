import type { Metadata } from 'next';
import Link from 'next/link';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { labelOffers } from '@/lib/cart';
import { formatMinor } from '@/lib/currency';
import type { Order } from '@/lib/commerce-types';
import { listOrders, reconcileOrderPayments } from '@/lib/orders';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Orders',
};

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
    ? 'Approve the prompt on your phone to complete this order.'
    : null;
}

export default async function OrdersPage({
  searchParams,
}: PageProps<'/orders'>) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Sign in to see what you have ordered.
        </p>
        <Button asChild size="sm">
          <Link href="/account">Sign in</Link>
        </Button>
      </div>
    );
  }

  const { placed } = await searchParams;
  const justPlaced = typeof placed === 'string' ? placed : undefined;

  let orders;
  let labels;
  try {
    orders = await listOrders();

    // A payment the customer has already approved settles at the gateway
    // within seconds, and nothing pushes that back to us — so ask, then read
    // again if anything moved.
    if (await reconcileOrderPayments(orders)) {
      orders = await listOrders();
    }

    labels = await labelOffers(
      orders.flatMap((order) => order.items.map((item) => item.offerId)),
    );
  } catch (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>

      {justPlaced ? (
        <div
          role="status"
          className="rounded-2xl border border-dashed px-4 py-3 text-sm"
        >
          <p className="font-medium">Order placed — awaiting payment</p>
          <p className="text-muted-foreground text-pretty">
            It is the first one below, under reference{' '}
            <span className="font-mono">{justPlaced.slice(0, 8)}</span>. If you
            paid by mobile money, approve the prompt on your phone; the status
            here updates once the payment clears.
          </p>
        </div>
      ) : null}

      {orders.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
          <p className="font-medium">No orders yet</p>
          <p className="text-muted-foreground text-sm">
            Anything you buy shows up here.
          </p>
          <Button asChild size="sm">
            <Link href="/products">Browse products</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => (
            <li key={order.id}>
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs">
                        {order.id.slice(0, 8)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(order.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <Badge
                      variant={
                        order.status === 'PAID' ? 'default' : 'secondary'
                      }
                    >
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
                      <li
                        key={item.id}
                        className="flex justify-between gap-3 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {labels.get(item.offerId)?.name ?? 'Item'} ×{' '}
                          {item.quantity}
                        </span>
                        <span>
                          {formatMinor(item.lineTotal, item.currency)}
                        </span>
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
      )}
    </div>
  );
}
