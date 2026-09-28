import type { Order, PaymentStatus } from './commerce-types';

/** Payment states that can still move on without the shopper doing more. */
const IN_FLIGHT: PaymentStatus[] = ['PENDING', 'PROCESSING', 'REQUIRES_ACTION'];

export type PaymentState = {
  tone: 'success' | 'waiting' | 'problem' | 'neutral';
  title: string;
  detail: string | null;
  /** Still waiting on the gateway — worth polling for. */
  awaiting: boolean;
  /** The order itself can still be cancelled (only before payment). */
  canCancelOrder: boolean;
  /** There is a gateway payment still in flight that can be stopped. */
  canCancelPayment: boolean;
};

/**
 * What the customer is told about an order's payment, in one place, so the
 * confirmation page and the order page never disagree.
 */
export function describePayment(
  order: Pick<Order, 'status' | 'payment'>,
): PaymentState {
  const payment = order.payment ?? null;
  const pending = order.status === 'PENDING_PAYMENT';
  const inFlight = pending && payment !== null && IN_FLIGHT.includes(payment.status);
  const base = {
    awaiting: inFlight,
    canCancelOrder: pending,
    canCancelPayment: inFlight,
  };

  if (order.status === 'PAID') {
    return { ...base, tone: 'success', title: 'Paid', detail: null };
  }

  if (order.status === 'CANCELLED') {
    return {
      ...base,
      tone: 'neutral',
      title: 'Cancelled',
      detail:
        payment?.status === 'FAILED'
          ? (payment.failureReason ?? 'The payment did not go through.')
          : 'Nothing was charged for this order.',
    };
  }

  if (order.status === 'REFUNDED' || order.status === 'PARTIALLY_REFUNDED') {
    return {
      ...base,
      tone: 'neutral',
      title: order.status === 'REFUNDED' ? 'Refunded' : 'Partially refunded',
      detail: null,
    };
  }

  // PENDING_PAYMENT from here on.
  switch (payment?.status) {
    case 'REQUIRES_ACTION':
      return {
        ...base,
        tone: 'waiting',
        title: 'Your bank needs you to confirm this payment',
        detail:
          'Finish the check your bank asked for. If you closed that page, cancel this order and place it again.',
      };
    case 'FAILED':
    case 'CANCELLED':
      return {
        ...base,
        tone: 'problem',
        title:
          payment.status === 'FAILED'
            ? 'Payment failed'
            : 'Payment cancelled',
        detail:
          payment.failureReason ??
          'Nothing was charged. Place the order again to pay another way.',
      };
    case 'SUCCEEDED':
      return {
        ...base,
        tone: 'waiting',
        title: 'Payment received — confirming your order',
        detail: null,
        // The money has moved; only the order has to catch up, which the
        // reconcile on each refresh does.
        awaiting: true,
        canCancelOrder: false,
      };
    case 'PENDING':
    case 'PROCESSING':
      return {
        ...base,
        tone: 'waiting',
        title: 'Waiting for your payment',
        detail:
          'Approve the payment prompt on your phone if you paid by mobile money. This page updates on its own.',
      };
    default:
      return {
        ...base,
        tone: 'waiting',
        title: 'Awaiting payment',
        detail: null,
      };
  }
}
