import type { OrderStatus } from './commerce-types';

/** Shared by the orders list and its detail modal, so both read the same
 * wording for a status badge. */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Refunded',
};
