'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { CheckoutQuoteResult } from '@/components/checkout-cost-summary';
import { readCurrency } from '@/lib/currency-cookie';
import { checkout, createAddress, getCheckoutQuote } from '@/lib/orders';
import { toFormState, type FormState } from '@/lib/form';
import { buildPaymentDetails } from '@/lib/payment-details';

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
  const itemIds = formData.getAll('itemIds').map(String).filter(Boolean);

  if (shippingAddressId === '') {
    return { status: 'error', message: 'Choose a delivery address.' };
  }

  if (itemIds.length === 0) {
    return {
      status: 'error',
      message: 'Select at least one item to check out.',
    };
  }

  let orderId: string;

  try {
    const result = await checkout(
      shippingAddressId,
      idempotencyKey,
      String(formData.get('currency') ?? '') || (await readCurrency()),
      buildPaymentDetails(formData),
      itemIds,
    );

    orderId = result.order.id;
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/cart');
  revalidatePath('/account');
  redirect(`/account?tab=orders&placed=${orderId}`);
}

/**
 * The cost breakdown checkout would charge right now, for whichever address
 * the shopper has currently selected.
 *
 * Called directly from the order summary rather than through
 * `useActionState`, which only ever hands back a pass/fail `FormState` — the
 * caller needs the quoted numbers themselves.
 */
export async function getCheckoutQuoteAction(input: {
  shippingAddressId: string;
  currency: string;
  itemIds: string[];
}): Promise<CheckoutQuoteResult> {
  try {
    const quote = await getCheckoutQuote(
      input.shippingAddressId,
      input.currency,
      input.itemIds,
    );
    return { status: 'ok', quote };
  } catch (error) {
    return {
      status: 'error',
      message: toFormState(error).message ?? 'Could not estimate shipping.',
    };
  }
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
