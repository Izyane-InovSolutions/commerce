'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { checkout, createAddress, listAddresses } from '@/lib/orders';
import type { Address } from '@/lib/commerce-types';
import { toFormState, type FormState } from '@/lib/form';
import { getCurrentUser } from '@/lib/session';

/** Splits a recipient name into the two fields the gateway's billing wants. */
function splitName(recipientName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = recipientName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? recipientName,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] ?? ''),
  };
}

/**
 * Builds the payment details the API expects, from the form and the address.
 *
 * Card billing is derived from the shipping address and the signed-in
 * account's email rather than asked for again: the gateway requires all of
 * it, and asking a shopper to retype an address they just chose is how carts
 * get abandoned. A separate billing address is a later ticket.
 */
function paymentDetails(
  formData: FormData,
  address: Address,
  email: string,
): Record<string, unknown> | undefined {
  const method = String(formData.get('paymentMethod') ?? '');

  if (method === 'mobile-money') {
    return {
      paymentMethod: 'MOBILE_MONEY',
      phoneNumber: String(formData.get('momoPhone') ?? '').replace(/\s+/g, ''),
      provider: String(formData.get('momoProvider') ?? '') || undefined,
    };
  }

  if (method !== 'card') {
    return undefined;
  }

  const [expiryMonth = '', expiryYear = ''] = String(
    formData.get('cardExpiry') ?? '',
  ).split('/');
  const { firstName, lastName } = splitName(address.recipientName);

  return {
    paymentMethod: 'CARD',
    card: {
      number: String(formData.get('cardNumber') ?? '').replace(/\s+/g, ''),
      expiryMonth,
      // The form takes two digits; the API wants the century spelled out.
      expiryYear: expiryYear === '' ? '' : `20${expiryYear}`,
      securityCode: String(formData.get('cardCvc') ?? ''),
      holderName: String(formData.get('cardName') ?? '').trim(),
      billing: {
        firstName,
        lastName,
        address1: address.line1,
        locality: address.city,
        administrativeArea: address.region ?? address.city,
        postalCode: address.postalCode,
        country: address.country.toUpperCase(),
        email,
      },
    },
  };
}

/**
 * Turns the cart into an order.
 *
 * If the gateway refuses, the API cancels the order it just created and
 * leaves the cart alone — so a failure here is genuinely retryable, and the
 * message says so rather than leaving a shopper wondering what they bought.
 */
export async function placeOrderAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const shippingAddressId = String(formData.get('shippingAddressId') ?? '');
  const idempotencyKey = String(formData.get('idempotencyKey') ?? '');

  if (shippingAddressId === '') {
    return { status: 'error', message: 'Choose a delivery address.' };
  }

  let orderId: string;

  try {
    const [user, addresses] = await Promise.all([
      getCurrentUser(),
      listAddresses(),
    ]);

    const address = addresses.find(
      (candidate) => candidate.id === shippingAddressId,
    );

    if (!user || !address) {
      return {
        status: 'error',
        message: 'That delivery address is no longer available.',
      };
    }

    const result = await checkout(
      shippingAddressId,
      idempotencyKey,
      paymentDetails(formData, address, user.email),
    );

    orderId = result.order.id;
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/cart');
  revalidatePath('/orders');
  redirect(`/orders?placed=${orderId}`);
}

export async function createAddressAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const optional = (name: string): string | null => {
    const value = String(formData.get(name) ?? '').trim();
    return value === '' ? null : value;
  };

  try {
    await createAddress({
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
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/checkout');
  return { status: 'idle', message: 'Address saved.' };
}
