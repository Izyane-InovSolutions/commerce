import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { OrderActions } from '@/components/order-actions';
import { OrderPaymentStatus } from '@/components/order-payment-status';
import { OrderReceipt } from '@/components/order-receipt';
import { OrderShippingTimeline } from '@/components/order-shipping-timeline';
import { OrderSignInPrompt } from '@/components/order-sign-in-prompt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { labelOffers } from '@/lib/cart';
import type { Order, OrderShipment } from '@/lib/commerce-types';
import { describePayment } from '@/lib/order-payment-state';
import { STATUS_LABELS } from '@/lib/order-status-labels';
import { getOrderShipments, loadOwnOrder } from '@/lib/orders';
import {
  RETURN_STATUS_LABELS,
  type ReturnEligibility,
  type ReturnRequest,
} from '@/lib/return-types';
import { getReturnEligibility, listReturns } from '@/lib/returns';
import { getCurrentUser } from '@/lib/session';

import { cancelOrderAction, cancelPaymentAction } from '../actions';

export const metadata: Metadata = {
  title: 'Order',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Only a paid order has anything to return; asking about any other one is
 * a wasted request. */
function canHaveReturns(order: Order): boolean {
  return order.status === 'PAID' || order.status === 'PARTIALLY_REFUNDED';
}

/**
 * The extras on this page — shipping, returns — are each read on their own
 * and allowed to fail: the order itself is what the page is for, and one
 * missing panel says so rather than taking the rest down with it.
 */
async function readOptional<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export default async function OrderPage({ params }: PageProps<'/orders/[id]'>) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <OrderSignInPrompt title="Order" message="Sign in to see this order." />
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
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Order</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  if (!order || !labels) {
    notFound();
  }

  const unpaid =
    order.status === 'PENDING_PAYMENT' || order.status === 'CANCELLED';
  const returnable = canHaveReturns(order);
  const orderId = order.id;

  const [shipments, eligibility, returns] = await Promise.all([
    unpaid
      ? Promise.resolve<OrderShipment[]>([])
      : readOptional(() => getOrderShipments(orderId)),
    returnable
      ? readOptional(() => getReturnEligibility(orderId))
      : Promise.resolve<ReturnEligibility[]>([]),
    returnable
      ? readOptional(() => listReturns()).then(
          (all) =>
            all?.filter((request) => request.orderId === orderId) ?? null,
        )
      : Promise.resolve<ReturnRequest[]>([]),
  ]);

  const payment = describePayment(order);
  const eligibilityByItem = new Map(
    (eligibility ?? []).map((line) => [line.orderItemId, line]),
  );
  const canRequestReturn = (eligibility ?? []).some(
    (line) => line.returnable && line.totalRemainingQuantity > 0,
  );

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/account?tab=orders">
          <ArrowLeft data-icon="inline-start" />
          Your orders
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          Order <span className="font-mono">{order.id.slice(0, 8)}</span>
          <Badge variant={order.status === 'PAID' ? 'default' : 'secondary'}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        </h1>
        <p className="text-muted-foreground text-sm">
          Placed {formatDate(order.createdAt)}
        </p>
      </div>

      {order.status !== 'PAID' ? <OrderPaymentStatus state={payment} /> : null}

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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-base font-semibold">Delivery</h2>
            {shipments === null ? (
              <p className="text-muted-foreground text-sm">
                Shipping progress isn’t available right now.
              </p>
            ) : (
              <OrderShippingTimeline order={order} shipments={shipments} />
            )}
            {shipments && shipments.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {shipments.map((shipment) => (
                  <li key={shipment.id} className="text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {shipment.shipmentNumber}
                    </span>{' '}
                    · {shipment.methodName}
                    {shipment.trackingReference ? (
                      <>
                        {' '}
                        · Tracking{' '}
                        <span className="font-mono">
                          {shipment.trackingReference}
                        </span>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        {returnable ? (
          <Card>
            <CardContent className="space-y-4">
              <h2 className="text-base font-semibold">Returns</h2>
              {returns && returns.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {returns.map((request) => (
                    <li
                      key={request.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <Link
                        href={`/returns/${request.id}`}
                        className="font-medium hover:underline"
                      >
                        Return {request.rmaNumber ?? request.id.slice(0, 8)}
                      </Link>
                      <Badge variant="secondary">
                        {RETURN_STATUS_LABELS[request.status] ?? request.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
              {eligibility === null || returns === null ? (
                <p className="text-muted-foreground text-sm">
                  Return details aren’t available right now.
                </p>
              ) : canRequestReturn ? (
                <Button asChild size="sm">
                  <Link href={`/orders/${order.id}/return`}>
                    Request a return
                  </Link>
                </Button>
              ) : (
                <p className="text-muted-foreground text-sm text-pretty">
                  Nothing on this order can be returned right now. Items become
                  returnable once delivered, for as long as their return window
                  lasts.{' '}
                  <Link href="/help#returns" className="underline">
                    Returns policy
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <OrderReceipt
        order={order}
        labels={labels}
        itemExtra={(item) => {
          const line = eligibilityByItem.get(item.id);
          const itemReturns = (returns ?? []).filter((request) =>
            request.items.some((entry) => entry.orderItemId === item.id),
          );
          if (!line?.returnable && itemReturns.length === 0) {
            return null;
          }
          return (
            <div className="text-muted-foreground space-y-0.5 text-xs">
              {itemReturns.map((request) => (
                <p key={request.id}>
                  <Link
                    href={`/returns/${request.id}`}
                    className="hover:underline"
                  >
                    Return: {RETURN_STATUS_LABELS[request.status]}
                  </Link>
                </p>
              ))}
              {line?.returnable && line.totalRemainingQuantity > 0 ? (
                <p>
                  {line.totalRemainingQuantity} returnable
                  {/* The earliest window, so the date is never later than
                      when some of these units stop being returnable. */}
                  {line.chunks.length > 0
                    ? ` — return by ${formatDate(
                        line.chunks
                          .map((chunk) => chunk.eligibleUntil)
                          .sort((a, b) => Date.parse(a) - Date.parse(b))[0]!,
                      )}`
                    : ''}
                </p>
              ) : null}
            </div>
          );
        }}
      />
    </div>
  );
}
