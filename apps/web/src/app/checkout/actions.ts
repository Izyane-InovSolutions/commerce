'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { readCurrency } from '@/lib/currency-cookie';
import { checkout, createAddress } from '@/lib/orders';
import { toFormState, type FormState } from '@/lib/form';

/** Splits one typed name into the two the gateway's billing block wants. */
function splitName(holderName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = holderName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? holderName,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] ?? ''),
  };
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

/**
 * Builds the payment details the API expects from what was typed.
 *
 * The billing block is asked for rather than taken from the shipping address:
 * the card processor matches it against the issuer's record, and the address
 * an order ships to is often not the one the card is registered at. Every
 * field it requires has its own input, so nothing is inferred.
 *
 * None of it is stored here — it is passed straight through to the API, which
 * hands it to the gateway.
 */
function paymentDetails(
  formData: FormData,
): Record<string, unknown> | undefined {
  const method = field(formData, 'paymentMethod');

  if (method === 'mobile-money') {
    return {
      paymentMethod: 'MOBILE_MONEY',
      phoneNumber: field(formData, 'momoPhone').replace(/\s+/g, ''),
      provider: field(formData, 'momoProvider') || undefined,
    };
  }

  if (method !== 'card') {
    return undefined;
  }

  // The field is typed as MM/YYYY, which is exactly the split the gateway
  // takes — no century to infer.
  const [expiryMonth = '', expiryYear = ''] = field(
    formData,
    'cardExpiry',
  ).split('/');
  const { firstName, lastName } = splitName(field(formData, 'cardName'));

  return {
    paymentMethod: 'CARD',
    card: {
      number: field(formData, 'cardNumber').replace(/\s+/g, ''),
      expiryMonth,
      expiryYear,
      securityCode: field(formData, 'cardCvc'),
      holderName: field(formData, 'cardName'),
      billing: {
        firstName,
        lastName,
        address1: field(formData, 'billingAddress1'),
        locality: field(formData, 'billingCity'),
        administrativeArea: field(formData, 'billingState'),
        postalCode: field(formData, 'billingPostalCode'),
        country: field(formData, 'billingCountry').toUpperCase(),
        email: field(formData, 'billingEmail'),
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
    const result = await checkout(
      shippingAddressId,
      idempotencyKey,
      String(formData.get('currency') ?? '') || (await readCurrency()),
      paymentDetails(formData),
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
