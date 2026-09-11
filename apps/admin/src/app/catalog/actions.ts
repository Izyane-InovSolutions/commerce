'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  approveProduct,
  createProduct,
  rejectProduct,
  resolveProductBrand,
  resolveProductCategory,
  updateProduct,
} from '@commerce/api-client';
import type { ResolveProposalInput } from '@commerce/contracts';
import type { CreateProductInput } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

/**
 * Reads the repeatable variant rows out of a form submission.
 *
 * Rows are posted as parallel `variantName[]` / `variantSku[]` /
 * `variantAttributes[]` arrays, so they are zipped back together by position.
 */
function readVariants(formData: FormData): CreateProductInput['variants'] {
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

function readProductInput(formData: FormData): CreateProductInput {
  return {
    name: String(formData.get('name') ?? '').trim(),
    slug: String(formData.get('slug') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim(),
    status: String(
      formData.get('status') ?? 'draft',
    ) as CreateProductInput['status'],
    brandId: (formData.get('brandId') as string) || null,
    categoryId: (formData.get('categoryId') as string) || null,
    variants: readVariants(formData),
  };
}

export async function createProductAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let productId: string;

  try {
    const product = await createProduct(apiClient, readProductInput(formData));
    productId = product.id;
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/catalog');
  revalidatePath('/inventory');
  redirect(`/catalog/${productId}`);
}

export async function updateProductAction(
  productId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await updateProduct(apiClient, productId, readProductInput(formData));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/catalog');
  revalidatePath(`/catalog/${productId}`);
  revalidatePath('/inventory');
  return { status: 'idle', message: 'Saved.' };
}

export async function approveProductAction(
  productId: string,
): Promise<FormState> {
  try {
    await approveProduct(apiClient, productId);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/catalog');
  revalidatePath(`/catalog/${productId}`);
  return { status: 'idle', message: 'Product approved and now on sale.' };
}

export async function rejectProductAction(
  productId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await rejectProduct(
      apiClient,
      productId,
      String(formData.get('reason') ?? '').trim(),
    );
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/catalog');
  revalidatePath(`/catalog/${productId}`);
  return { status: 'idle', message: 'Submission rejected.' };
}

/**
 * Settles a brand or category the seller proposed.
 *
 * Which of the three outcomes applies comes from the button pressed, so the
 * admin never has to describe their intent twice.
 */
export async function resolveProposalAction(
  productId: string,
  axis: 'brand' | 'category',
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const action = String(formData.get('action') ?? '');
  let input: ResolveProposalInput;

  if (action === 'attach') {
    const id = String(formData.get('existingId') ?? '');
    if (!id) {
      return {
        status: 'error',
        message: `Choose the ${axis} to map this onto.`,
      };
    }
    input = { action: 'attach', id };
  } else if (action === 'create') {
    input = {
      action: 'create',
      name: String(formData.get('name') ?? '').trim(),
      slug: String(formData.get('slug') ?? '').trim(),
      parentId: (formData.get('parentId') as string) || null,
    };
  } else if (action === 'dismiss') {
    input = { action: 'dismiss' };
  } else {
    return { status: 'error', message: 'Choose what to do with the proposal.' };
  }

  try {
    await (axis === 'brand'
      ? resolveProductBrand(apiClient, productId, input)
      : resolveProductCategory(apiClient, productId, input));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/catalog');
  revalidatePath(`/catalog/${productId}`);
  revalidatePath(axis === 'brand' ? '/brands' : '/categories');
  return { status: 'idle', message: 'Settled.' };
}
