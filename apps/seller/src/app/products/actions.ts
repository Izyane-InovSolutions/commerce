'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  adjustInventory,
  submitDraftProduct,
  submitProduct,
  updateSellerProduct,
} from '@commerce/api-client';
import type { SubmitProductInput } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

/** Parses `colour=Oak, width=140cm` into an attribute map. */
function parseAttributes(input: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const pair of input.split(',')) {
    const [key, ...rest] = pair.split('=');
    const name = key?.trim();
    const value = rest.join('=').trim();
    if (name && value) {
      attributes[name] = value;
    }
  }

  return attributes;
}

/**
 * Reads the repeatable variant rows out of a form submission.
 *
 * Rows are posted as parallel arrays, so they are zipped back by position.
 */
function readVariants(formData: FormData): SubmitProductInput['variants'] {
  const names = formData.getAll('variantName').map(String);
  const skuCodes = formData.getAll('variantSku').map(String);
  const attributes = formData.getAll('variantAttributes').map(String);

  return names
    .map((name, index) => ({
      name: name.trim(),
      skuCode: (skuCodes[index] ?? '').trim().toUpperCase(),
      attributes: parseAttributes(attributes[index] ?? ''),
    }))
    .filter((variant) => variant.name !== '' || variant.skuCode !== '');
}

/** The select value meaning the seller is naming something new. */
const PROPOSE = '__propose__';

/**
 * Reads one taxonomy choice.
 *
 * The select and the free-text field are mutually exclusive, which the
 * contract also enforces — so exactly one of the two comes back set.
 */
function readTaxonomyChoice(
  formData: FormData,
  idField: string,
  proposalField: string,
): { id: string | null; proposed: string | null } {
  const choice = String(formData.get(idField) ?? '');
  if (choice !== PROPOSE) {
    return { id: choice || null, proposed: null };
  }

  return {
    id: null,
    proposed: String(formData.get(proposalField) ?? '').trim() || null,
  };
}

function readProductInput(formData: FormData): SubmitProductInput {
  const brand = readTaxonomyChoice(formData, 'brandId', 'proposedBrandName');
  const category = readTaxonomyChoice(
    formData,
    'categoryId',
    'proposedCategoryName',
  );

  return {
    name: String(formData.get('name') ?? '').trim(),
    slug: String(formData.get('slug') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim(),
    brandId: brand.id,
    categoryId: category.id,
    proposedBrandName: brand.proposed,
    proposedCategoryName: category.proposed,
    variants: readVariants(formData),
    // The button the seller pressed decides whether this goes for review.
    status: formData.get('intent') === 'draft' ? 'draft' : 'pending',
  };
}

function revalidateProducts(): void {
  revalidatePath('/products');
  revalidatePath('/inventory');
}

export async function createProductAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let productId: string;

  try {
    const product = await submitProduct(apiClient, readProductInput(formData));
    productId = product.id;
  } catch (error) {
    return toFormState(error);
  }

  revalidateProducts();
  redirect(`/products/${productId}`);
}

export async function updateProductAction(
  productId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await updateSellerProduct(apiClient, productId, readProductInput(formData));
  } catch (error) {
    return toFormState(error);
  }

  revalidateProducts();
  revalidatePath(`/products/${productId}`);
  return { status: 'idle', message: 'Saved.' };
}

export async function submitDraftAction(productId: string): Promise<FormState> {
  try {
    await submitDraftProduct(apiClient, productId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateProducts();
  revalidatePath(`/products/${productId}`);
  return { status: 'idle', message: 'Sent for review.' };
}

export async function adjustStockAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const delta = Number(formData.get('delta'));
  if (!Number.isInteger(delta) || delta === 0) {
    return {
      status: 'error',
      fieldErrors: { delta: ['Enter a non-zero whole number.'] },
    };
  }

  try {
    await adjustInventory(apiClient, {
      skuId: String(formData.get('skuId') ?? ''),
      locationId: String(formData.get('locationId') ?? ''),
      delta,
      reason: 'received',
      note: '',
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateProducts();
  return { status: 'idle', message: 'Stock updated.' };
}
