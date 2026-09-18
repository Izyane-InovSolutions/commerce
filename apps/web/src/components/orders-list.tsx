import {
  EmptyOrdersState,
  OrdersFilterList,
  type OrderCard,
} from '@/components/orders-filter-list';
import type { OfferLabel } from '@/lib/cart';
import type { Order } from '@/lib/commerce-types';

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

/**
 * Shared by the standalone orders page and the account page's Orders tab.
 *
 * Stays a server component so it can resolve offer names off `labels`
 * directly — a `Map` cannot cross into `OrdersFilterList`, which needs to be
 * a client component for the status filter to be interactive.
 */
export function OrdersList({
  orders,
  labels,
}: {
  orders: Order[];
  labels: Map<string, OfferLabel>;
}) {
  if (orders.length === 0) {
    return <EmptyOrdersState />;
  }

  const cards: OrderCard[] = orders.map((order) => ({
    id: order.id,
    createdAt: order.createdAt,
    status: order.status,
    paymentNote: paymentNote(order),
    items: order.items.map((item) => ({
      id: item.id,
      name: labels.get(item.offerId)?.name ?? 'Item',
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      currency: item.currency,
    })),
    subtotal: order.subtotal,
    shippingAmount: order.shippingAmount,
    total: order.total,
    currency: order.currency,
    fulfillmentSummary: order.fulfillmentSummary,
  }));

  return <OrdersFilterList orders={cards} />;
}
