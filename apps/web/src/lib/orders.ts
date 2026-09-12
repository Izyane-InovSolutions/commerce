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
