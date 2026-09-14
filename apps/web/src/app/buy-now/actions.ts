'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { readCurrency } from '@/lib/currency-cookie';
import { checkoutOffer, createAddress } from '@/lib/orders';
import { toFormState, type FormState } from '@/lib/form';
import { buildPaymentDetails } from '@/lib/payment-details';

/**
 * Turns one offer directly into an order — "buy now" rather than
 * "add to cart, then checkout". The persisted cart is never touched, so
 * there is nothing here to clear or to be blocked by.
 */
export async function buyNowAction(
  offerId: string,
  quantity: number,
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
    const result = await checkoutOffer(
      offerId,
      quantity,
      shippingAddressId,
      idempotencyKey,
      String(formData.get('currency') ?? '') || (await readCurrency()),
      buildPaymentDetails(formData),
    );

    orderId = result.order.id;
  } catch (error) {
    return toFormState(error);
  }

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

  // Every /buy-now/[slug] page, not just the one the address was added
  // from — the address list is the same regardless of which product got
  // you there.
  revalidatePath('/buy-now/[slug]', 'page');
  return { status: 'idle', message: 'Address saved.' };
}
