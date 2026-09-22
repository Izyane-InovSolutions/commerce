import { redirect } from 'next/navigation';

/**
 * Shipping is processed from an order's own page now, not a separate queue —
 * `GET /admin/fulfillments` and `GET /admin/shipments` are both wired there.
 */
export default function FulfillmentPage() {
  redirect('/orders');
}
