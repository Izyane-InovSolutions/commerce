import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { OrderActions } from '@/components/order-actions';
import { OrderPaymentStatus } from '@/components/order-payment-status';
import { OrderReceipt } from '@/components/order-receipt';
import { OrderSignInPrompt } from '@/components/order-sign-in-prompt';
import { Button } from '@/components/ui/button';
import { labelOffers } from '@/lib/cart';
import { describePayment } from '@/lib/order-payment-state';
import { loadOwnOrder } from '@/lib/orders';
import { getCurrentUser } from '@/lib/session';

import { cancelOrderAction, cancelPaymentAction } from '../../actions';

export const metadata: Metadata = {
  title: 'Order confirmation',
};

/**
 * Where every checkout lands (`orderConfirmationPath`), and where the gateway
 * returns a shopper after a challenge.
 *
 * The payment may well still be moving when this first renders — a mobile
 * money prompt waiting on the shopper's phone, say — so the status box polls
 * (re-rendering this page, which reconciles with the gateway each time via
 * `loadOwnOrder`) until it settles.
 */
export default async function OrderConfirmationPage({
  params,
}: PageProps<'/orders/[id]/confirmation'>) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <OrderSignInPrompt
        title="Order confirmation"
        message="Sign in to see this order."
      />
    );
  }

  let order;
  let labels;

  try {
    order = await loadOwnOrder(id);
    labels = order
      ? await labelOffers(order.items.map((item) => item.offerId))
      : null;
  } catch (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          Order confirmation
        </h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  if (!order || !labels) {
    notFound();
  }

  const payment = describePayment(order);
  const heading =
    order.status === 'PAID'
      ? 'Thank you — your order is confirmed'
      : order.status === 'CANCELLED' || payment.tone === 'problem'
        ? 'Your order didn’t go through'
        : 'Thank you — your order is placed';

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {heading}
        </h1>
        <p className="text-muted-foreground text-sm">
          Order reference{' '}
          <span className="text-foreground font-mono">
            {order.id.slice(0, 8)}
          </span>
        </p>
      </div>

      <OrderPaymentStatus state={payment} />

      <OrderActions
        cancelOrder={
          payment.canCancelOrder
            ? cancelOrderAction.bind(null, order.id)
            : undefined
        }
        cancelPayment={
          payment.canCancelPayment && order.payment
            ? cancelPaymentAction.bind(null, order.id, order.payment.id)
            : undefined
        }
      />

      <OrderReceipt order={order} labels={labels} />

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={`/orders/${order.id}`}>View order details</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}
