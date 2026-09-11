'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createOffer, updateOffer } from '@commerce/api-client';
import type { CreateOfferInput } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

function readOfferInput(formData: FormData): CreateOfferInput {
  return {
    skuId: String(formData.get('skuId') ?? ''),
    price: String(formData.get('price') ?? '').trim(),
    compareAtPrice: String(formData.get('compareAtPrice') ?? '').trim(),
    condition: String(
      formData.get('condition') ?? 'new',
    ) as CreateOfferInput['condition'],
    status: String(
      formData.get('status') ?? 'draft',
    ) as CreateOfferInput['status'],
    fulfillmentMode: String(
      formData.get('fulfillmentMode') ?? 'seller',
    ) as CreateOfferInput['fulfillmentMode'],
    handlingTimeDays: Number(formData.get('handlingTimeDays') ?? 1),
  };
}

export async function createOfferAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let offerId: string;

  try {
    // The API takes the seller from the session, so there is nothing here
    // that could point the offer at another account.
    const offer = await createOffer(apiClient, readOfferInput(formData));
    offerId = offer.id;
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/offers');
  revalidatePath('/inventory');
  redirect(`/offers/${offerId}`);
}

export async function updateOfferAction(
  offerId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    // The SKU an offer sits against is fixed; changing it would be a new offer.
    const { skuId, ...changes } = readOfferInput(formData);
    void skuId;
    await updateOffer(apiClient, offerId, changes);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/offers');
  revalidatePath(`/offers/${offerId}`);
  return { status: 'idle', message: 'Saved.' };
}
