import { apiClient } from './api';
import type { SuccessEnvelope } from './catalog-types';
import type { Address, CheckoutResult, Order } from './commerce-types';

/** A signed-in visitor's own orders, and the addresses they ship to. */

export async function listOrders(): Promise<Order[]> {
  const response = await apiClient.get<SuccessEnvelope<Order[]>>('/orders', {
    cache: 'no-store',
  });
  return response.data;
}

/** Payment states that can still move, and so are worth asking about. */
const UNSETTLED = ['PENDING', 'REQUIRES_ACTION', 'PROCESSING'];

/**
 * Brings orders into line with what the payment gateway says.
 *
 * The gateway settles a mobile money charge seconds after checkout but cannot
 * tell this system so — its callback signing is undocumented, so the webhook
 * rejects every delivery. Asking on the customer's behalf when they look at
 * their orders is what turns "Awaiting payment" into "Paid" for an order they
 * have already paid for.
 *
 * Best-effort by design: a gateway that is slow or down must not stop someone
 * seeing their orders, so a failure here leaves the list as it was.
 */
export async function reconcileOrderPayments(
  orders: Order[],
): Promise<boolean> {
  const pending = orders.filter(
    (order) =>
      order.status === 'PENDING_PAYMENT' &&
      order.payment &&
      UNSETTLED.includes(order.payment.status),
  );

  if (pending.length === 0) {
    return false;
  }

  const outcomes = await Promise.all(
    pending.map(async (order) => {
      try {
        await apiClient.post(`/payments/${order.payment!.id}/status`);
        return true;
      } catch {
        return false;
      }
    }),
  );

  return outcomes.some(Boolean);
}

export async function listAddresses(): Promise<Address[]> {
  const response = await apiClient.get<SuccessEnvelope<Address[]>>(
    '/users/me/addresses',
    { cache: 'no-store' },
  );
  return response.data;
}

export async function createAddress(
  input: Omit<Address, 'id' | 'isDefault'>,
): Promise<Address> {
  const response = await apiClient.post<SuccessEnvelope<Address>>(
    '/users/me/addresses',
    { body: input },
  );
  return response.data;
}

/**
 * Turns the cart into an order, and starts its payment.
 *
 * The idempotency key matters here more than anywhere else in the storefront:
 * a retried checkout would otherwise be a second order against the same cart.
 */
export async function checkout(
  shippingAddressId: string,
  idempotencyKey: string,
  currency: string,
  paymentDetails?: Record<string, unknown>,
): Promise<CheckoutResult> {
  const response = await apiClient.post<SuccessEnvelope<CheckoutResult>>(
    '/checkout',
    {
      // The currency travels with the order rather than being read from the
      // cookie server-side, so the order is priced at what the shopper was
      // looking at when they confirmed — not at whatever they switched to
      // in another tab while the request was in flight.
      body: { shippingAddressId, currency, paymentDetails },
      idempotencyKey,
    },
  );
  return response.data;
}
