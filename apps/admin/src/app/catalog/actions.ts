'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  backendAddPrice,
  backendAddVariant,
  backendCreateOffer,
  backendCreateProduct,
  backendSetOfferShipping,
  backendSetOfferStatus,
  backendSetProductStatus,
  backendSetVariantStatus,
  backendUpdateProduct,
} from '@commerce/api-client';
import {
  backendProductStatusSchema,
  defaultBackendCurrency,
} from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

/** The API rejects an empty string where it expects a UUID, so blanks go out. */
function optionalId(value: FormDataEntryValue | null): string | undefined {
  const id = String(value ?? '').trim();
  return id === '' ? undefined : id;
}

function productInput(formData: FormData): {
  name: string;
  slug: string;
  description?: string;
  brandId?: string;
  categoryId?: string;
} {
  const description = String(formData.get('description') ?? '').trim();

  return {
    name: String(formData.get('name') ?? '').trim(),
    slug: String(formData.get('slug') ?? '').trim(),
    description: description === '' ? undefined : description,
    brandId: optionalId(formData.get('brandId')),
    categoryId: optionalId(formData.get('categoryId')),
  };
}

function revalidateCatalog(productId?: string): void {
  revalidatePath('/catalog');
  if (productId) {
    revalidatePath(`/catalog/${productId}`);
  }
}

export async function createProductAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let productId: string;

  try {
    const product = await backendCreateProduct(
      apiClient,
      productInput(formData),
    );
    productId = product.id;
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog();
  redirect(`/catalog/${productId}`);
}

export async function updateProductAction(
  productId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await backendUpdateProduct(apiClient, productId, productInput(formData));
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return { status: 'idle', message: 'Saved.' };
}

/** Moves an offer between the three states; the offer is named in the form. */
export async function setOfferStatusAction(
  productId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const status = backendProductStatusSchema.safeParse(formData.get('status'));
  if (!status.success) {
    return { status: 'error', message: 'Choose a status.' };
  }

  try {
    await backendSetOfferStatus(
      apiClient,
      String(formData.get('offerId') ?? ''),
      status.data,
    );
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return { status: 'idle', message: `Now ${status.data.toLowerCase()}.` };
}

/**
 * Moves a product or variant between DRAFT, PUBLISHED and ARCHIVED.
 *
 * Both carry the same three states, so one action covers them; which one is
 * being changed comes from the bound arguments.
 */
export async function setStatusAction(
  target: {
    kind: 'product' | 'variant' | 'offer';
    productId: string;
    id: string;
  },
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const status = backendProductStatusSchema.safeParse(formData.get('status'));
  if (!status.success) {
    return { status: 'error', message: 'Choose a status.' };
  }

  try {
    if (target.kind === 'product') {
      await backendSetProductStatus(apiClient, target.id, status.data);
    } else {
      await backendSetVariantStatus(
        apiClient,
        target.productId,
        target.id,
        status.data,
      );
    }
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(target.productId);
  return { status: 'idle', message: `Now ${status.data.toLowerCase()}.` };
}

export async function addVariantAction(
  productId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get('name') ?? '').trim();

  try {
    await backendAddVariant(apiClient, productId, {
      skuCode: String(formData.get('skuCode') ?? '').trim(),
      name: name === '' ? undefined : name,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return { status: 'idle', message: 'Variant added.' };
}

/**
 * Puts a variant on sale.
 *
 * The API models this as three steps — an offer, then a price on that offer,
 * then publishing it — because an offer carries no price of its own. Doing
 * them together here keeps the portal from exposing a half-priced offer.
 */
export async function createOfferAction(
  productId: string,
  variantId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = String(formData.get('amount') ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return {
      status: 'error',
      fieldErrors: { amount: ['Enter an amount such as 12.50.'] },
    };
  }

  try {
    const offer = await backendCreateOffer(apiClient, variantId);
    await backendAddPrice(apiClient, offer.id, {
      amount: Math.round(Number(raw) * 100),
      currency: String(
        formData.get('currency') ?? defaultBackendCurrency,
      ).toUpperCase(),
    });
    await backendSetOfferStatus(apiClient, offer.id, 'PUBLISHED');
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return { status: 'idle', message: 'Offer created and published.' };
}

/**
 * Adds a price to an offer.
 *
 * The offer is named in the form rather than bound into the action, because a
 * server action cannot be produced by a factory on the client side.
 */
export async function addPriceAction(
  productId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const offerId = String(formData.get('offerId') ?? '');
  const raw = String(formData.get('amount') ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return {
      status: 'error',
      fieldErrors: { amount: ['Enter an amount such as 12.50.'] },
    };
  }

  try {
    await backendAddPrice(apiClient, offerId, {
      amount: Math.round(Number(raw) * 100),
      currency: String(
        formData.get('currency') ?? defaultBackendCurrency,
      ).toUpperCase(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return { status: 'idle', message: 'Price updated.' };
}

/**
 * Sets or clears an offer's flat shipping cost.
 *
 * An empty amount clears it — there's no separate "remove" control, since a
 * blank field reads more naturally as "no shipping cost" than a second
 * button would.
 */
export async function setOfferShippingAction(
  productId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const offerId = String(formData.get('offerId') ?? '');
  const raw = String(formData.get('shippingAmount') ?? '').trim();

  if (raw === '') {
    try {
      await backendSetOfferShipping(apiClient, offerId, { amount: null });
    } catch (error) {
      return toFormState(error);
    }
    revalidateCatalog(productId);
    return { status: 'idle', message: 'Shipping cost cleared.' };
  }

  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return {
      status: 'error',
      fieldErrors: { shippingAmount: ['Enter an amount such as 12.50.'] },
    };
  }

  try {
    await backendSetOfferShipping(apiClient, offerId, {
      amount: Math.round(Number(raw) * 100),
      currency: String(
        formData.get('shippingCurrency') ?? defaultBackendCurrency,
      ).toUpperCase(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return { status: 'idle', message: 'Shipping cost updated.' };
}
