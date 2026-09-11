'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  backendAddSellerOfferPrice,
  backendCreateSellerOffer,
  backendSetSellerOfferStatus,
  backendUpdateSellerOffer,
} from '@commerce/api-client';
import {
  backendOfferConditionSchema,
  backendOfferSourceSchema,
  backendProductStatusSchema,
} from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import { toMinor } from '@/lib/money';

function revalidateProducts(offerId?: string): void {
  revalidatePath('/products');
  if (offerId) {
    revalidatePath(`/products/${offerId}`);
  }
}

/** The listing fields the API takes on both create and update. */
function offerDetails(formData: FormData): {
  sellerSku: string;
  listingTitle: string;
  condition: 'NEW' | 'USED' | 'REFURBISHED';
  stockSource: 'PLATFORM' | 'SELLER';
  fulfillmentMode: 'PLATFORM' | 'SELLER';
} {
  return {
    sellerSku: String(formData.get('sellerSku') ?? '').trim(),
    listingTitle: String(formData.get('listingTitle') ?? '').trim(),
    condition: backendOfferConditionSchema
      .catch('NEW')
      .parse(formData.get('condition')),
    stockSource: backendOfferSourceSchema
      .catch('PLATFORM')
      .parse(formData.get('stockSource')),
    fulfillmentMode: backendOfferSourceSchema
      .catch('PLATFORM')
      .parse(formData.get('fulfillmentMode')),
  };
}

/**
 * Lists a variant for sale, and prices it.
 *
 * An offer carries no price of its own, so a newly created one is not
 * sellable until a price is appended to it — which is a second call. Doing
 * both here means a seller cannot accidentally publish a listing with no
 * price, and the price uses the version the create call just returned.
 */
export async function createOfferAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const amount = toMinor(String(formData.get('amount') ?? ''));
  if (!Number.isFinite(amount) || amount < 1) {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: { amount: ['Enter a price above zero.'] },
    };
  }

  let offerId: string;

  try {
    const offer = await backendCreateSellerOffer(apiClient, {
      ...offerDetails(formData),
      variantId: String(formData.get('variantId') ?? '').trim(),
    });

    await backendAddSellerOfferPrice(apiClient, offer.id, {
      version: offer.version,
      amount,
      currency: String(formData.get('currency') ?? 'ZMW')
        .trim()
        .toUpperCase(),
    });

    offerId = offer.id;
  } catch (error) {
    return toFormState(error);
  }

  revalidateProducts();
  redirect(`/products/${offerId}`);
}

export async function updateOfferAction(
  offerId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await backendUpdateSellerOffer(apiClient, offerId, {
      ...offerDetails(formData),
      version: Number(formData.get('version')),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateProducts(offerId);
  return { status: 'idle', message: 'Saved.' };
}

/**
 * Moves a listing between draft, published, and archived.
 *
 * Published is what puts it in front of customers; the platform still has to
 * have the product and variant published for it to be reachable.
 */
export async function setOfferStatusAction(
  offerId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const status = backendProductStatusSchema.safeParse(formData.get('status'));
  if (!status.success) {
    return { status: 'error', message: 'Choose a status.' };
  }

  try {
    await backendSetSellerOfferStatus(apiClient, offerId, {
      version: Number(formData.get('version')),
      status: status.data,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateProducts(offerId);
  return { status: 'idle', message: 'Status updated.' };
}

/** Appends a price; the one it replaces stays in the offer's history. */
export async function addOfferPriceAction(
  offerId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const amount = toMinor(String(formData.get('amount') ?? ''));
  if (!Number.isFinite(amount) || amount < 1) {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: { amount: ['Enter a price above zero.'] },
    };
  }

  try {
    await backendAddSellerOfferPrice(apiClient, offerId, {
      version: Number(formData.get('version')),
      amount,
      currency: String(formData.get('currency') ?? 'ZMW')
        .trim()
        .toUpperCase(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateProducts(offerId);
  return { status: 'idle', message: 'Price updated.' };
}
