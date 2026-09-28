'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  backendAddPrice,
  backendAddVariant,
  backendApproveProductSubmission,
  backendCreateOffer,
  backendCreateProduct,
  backendDeleteOffer,
  backendDeleteProduct,
  backendDeleteVariant,
  backendRejectProductSubmission,
  backendSetOfferShipping,
  backendSetOfferStatus,
  backendSetProductFeatured,
  backendSetProductStatus,
  backendSetVariantStatus,
  backendUpdateProduct,
  backendUpdateVariant,
} from '@commerce/api-client';
import {
  backendProductStatusSchema,
  defaultBackendCurrency,
} from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import { saleEndsAt } from '@/lib/sale-date';
import { guardAction } from '@/lib/session';

import { variantCreateInput, variantUpdateInput } from './variant-input';

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
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

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
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

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
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

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
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

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

/**
 * Deletes a product outright. The API only allows this for one that has never
 * sold or held stock; otherwise its refusal is shown and archiving is the way
 * to take it off sale.
 */
export async function deleteProductAction(
  productId: string,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendDeleteProduct(apiClient, productId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog();
  redirect('/catalog');
}

export async function deleteVariantAction(
  productId: string,
  variantId: string,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendDeleteVariant(apiClient, productId, variantId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return { status: 'idle', message: 'Variant deleted.' };
}

export async function addVariantAction(
  productId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendAddVariant(apiClient, productId, variantCreateInput(formData));
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return { status: 'idle', message: 'Variant added.' };
}

/** Renames a variant, changes its SKU, or re-picks its attribute values. */
export async function updateVariantAction(
  productId: string,
  variantId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  const input = variantUpdateInput(formData);
  if (input.skuCode === '') {
    return {
      status: 'error',
      fieldErrors: { skuCode: ['SKU code is required.'] },
    };
  }

  try {
    await backendUpdateVariant(apiClient, productId, variantId, input);
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return { status: 'idle', message: 'Variant saved.' };
}

/**
 * Deletes a platform offer. A seller's offer is refused by the API, which
 * points to suspending the seller instead; the refusal is shown in place.
 */
export async function deleteOfferAction(
  productId: string,
  offerId: string,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendDeleteOffer(apiClient, offerId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return { status: 'idle', message: 'Offer deleted.' };
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
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

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
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  const offerId = String(formData.get('offerId') ?? '');
  const raw = String(formData.get('amount') ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return {
      status: 'error',
      fieldErrors: { amount: ['Enter an amount such as 12.50.'] },
    };
  }

  const saleUntil = saleEndsAt(String(formData.get('saleUntil') ?? ''));
  if (saleUntil === 'invalid') {
    return {
      status: 'error',
      fieldErrors: { saleUntil: ['Choose a date after today.'] },
    };
  }

  try {
    await backendAddPrice(apiClient, offerId, {
      amount: Math.round(Number(raw) * 100),
      currency: String(
        formData.get('currency') ?? defaultBackendCurrency,
      ).toUpperCase(),
      endsAt: saleUntil ?? undefined,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return {
    status: 'idle',
    message: saleUntil ? 'Sale price added.' : 'Price updated.',
  };
}

/** Features the product on the storefront, or takes it off the shelf. */
export async function setFeaturedAction(
  productId: string,
  featured: boolean,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendSetProductFeatured(apiClient, productId, featured);
  } catch (error) {
    return toFormState(error);
  }

  revalidateCatalog(productId);
  return {
    status: 'idle',
    message: featured ? 'Featured on the storefront.' : 'No longer featured.',
  };
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
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

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

const SUBMISSION_REVIEWERS = {
  approve: backendApproveProductSubmission,
  reject: backendRejectProductSubmission,
} as const;

type SubmissionDecision = keyof typeof SUBMISSION_REVIEWERS;

const SUBMISSION_CONFIRMATIONS: Record<SubmissionDecision, string> = {
  approve: 'Approved and published.',
  reject: 'Rejected.',
};

function isSubmissionDecision(value: string): value is SubmissionDecision {
  return value in SUBMISSION_REVIEWERS;
}

/**
 * Approve or reject a seller's product submission — a reason is required
 * either way. Approving publishes the product and every variant on it in
 * the same step, so there's no separate publish click after.
 */
export async function reviewSubmissionAction(
  productId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  const decision = String(formData.get('decision') ?? '');
  if (!isSubmissionDecision(decision)) {
    return { status: 'error', message: 'Choose a decision.' };
  }

  const reason = String(formData.get('reason') ?? '').trim();
  if (reason === '') {
    return {
      status: 'error',
      fieldErrors: { reason: ['Say why.'] },
    };
  }

  try {
    await SUBMISSION_REVIEWERS[decision](apiClient, productId, { reason });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/catalog/submissions');
  revalidateCatalog(productId);
  return { status: 'idle', message: SUBMISSION_CONFIRMATIONS[decision] };
}
