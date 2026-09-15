import type { Metadata } from 'next';
import Link from 'next/link';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { OrderStatusPoller } from '@/components/order-status-poller';
import { OrdersList } from '@/components/orders-list';
import { Button } from '@/components/ui/button';
import { labelOffers } from '@/lib/cart';
import { listOrders, reconcileOrderPayments } from '@/lib/orders';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Orders',
};

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

  // Something is still waiting on a payment made elsewhere, so keep asking.
  const awaitingPayment = orders.some(
    (order) => order.status === 'PENDING_PAYMENT',
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        {awaitingPayment ? <OrderStatusPoller /> : null}
      </div>

      {justPlaced ? (
        <div
          role="status"
          className="rounded-2xl border border-dashed px-4 py-3 text-sm"
        >
          <p className="font-medium">Order placed</p>
          <p className="text-muted-foreground text-pretty">
            It is the first one below, under reference{' '}
            <span className="font-mono">{justPlaced.slice(0, 8)}</span>. Your
            payment status will update automatically.
          </p>
        </div>
      ) : null}

      <OrdersList orders={orders} labels={labels} />
    </div>
  );
}
