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

/** Payment states that have not reached the order yet. */
const UNAPPLIED = [
  'PENDING',
  'REQUIRES_ACTION',
  'PROCESSING',
  // A card charge settles inline, so a payment can read SUCCEEDED while its
  // order is still waiting. That needs applying too, not just watching.
  'SUCCEEDED',
];

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
      UNAPPLIED.includes(order.payment.status),
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

export type AddressInput = Omit<Address, 'id' | 'isDefault'>;

export async function createAddress(input: AddressInput): Promise<Address> {
  const response = await apiClient.post<SuccessEnvelope<Address>>(
    '/users/me/addresses',
    { body: input },
  );
  return response.data;
}

export async function updateAddress(
  id: string,
  input: AddressInput,
): Promise<Address> {
  const response = await apiClient.patch<SuccessEnvelope<Address>>(
    `/users/me/addresses/${id}`,
    { body: input },
  );
  return response.data;
}

export async function deleteAddress(id: string): Promise<void> {
  await apiClient.delete(`/users/me/addresses/${id}`);
}

export async function setDefaultAddress(id: string): Promise<Address> {
  const response = await apiClient.post<SuccessEnvelope<Address>>(
    `/users/me/addresses/${id}/default`,
  );
  return response.data;
}

/** Every field the address forms collect, pulled out of one submission. */
export function addressInputFromFormData(formData: FormData): AddressInput {
  const optional = (name: string): string | null => {
    const value = String(formData.get(name) ?? '').trim();
    return value === '' ? null : value;
  };

  return {
    label: optional('label'),
    recipientName: String(formData.get('recipientName') ?? '').trim(),
    phone: optional('phone'),
    line1: String(formData.get('line1') ?? '').trim(),
    line2: optional('line2'),
    city: String(formData.get('city') ?? '').trim(),
    region: optional('region'),
    postalCode: String(formData.get('postalCode') ?? '').trim(),
    country: String(formData.get('country') ?? 'ZM')
      .trim()
      .toUpperCase(),
  };
}

/**
 * Turns the cart — or a chosen subset of it — into an order, and starts its
 * payment.
 *
 * The idempotency key matters here more than anywhere else in the storefront:
 * a retried checkout would otherwise be a second order against the same cart.
 * `itemIds`, when given, checks out only those lines and leaves the rest of
 * the cart as it is; omitted, it is every line, same as before selective
 * checkout existed.
 */
export async function checkout(
  shippingAddressId: string,
  idempotencyKey: string,
  currency: string,
  paymentDetails?: Record<string, unknown>,
  itemIds?: string[],
): Promise<CheckoutResult> {
  const response = await apiClient.post<SuccessEnvelope<CheckoutResult>>(
    '/checkout',
    {
      // The currency travels with the order rather than being read from the
      // cookie server-side, so the order is priced at what the shopper was
      // looking at when they confirmed — not at whatever they switched to
      // in another tab while the request was in flight.
      body: { shippingAddressId, currency, paymentDetails, itemIds },
      idempotencyKey,
    },
  );
  return response.data;
}

/**
 * "Buy now": checks one offer out directly, at its own quantity, without
 * ever adding it to (or reading) the persisted cart.
 */
export async function checkoutOffer(
  offerId: string,
  quantity: number,
  shippingAddressId: string,
  idempotencyKey: string,
  currency: string,
  paymentDetails?: Record<string, unknown>,
): Promise<CheckoutResult> {
  const response = await apiClient.post<SuccessEnvelope<CheckoutResult>>(
    '/checkout/buy-now',
    {
      body: { offerId, quantity, shippingAddressId, currency, paymentDetails },
      idempotencyKey,
    },
  );
  return response.data;
}
