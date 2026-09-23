'use server';

import { redirect } from 'next/navigation';

import {
  backendAddSellerProductVariant,
  backendAttachSellerProductMedia,
  backendReserveUpload,
  backendSubmitProduct,
  backendUploadMediaContent,
} from '@commerce/api-client';
import { backendMediaTypes, type BackendMediaType } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

/** Matches the API's own default; it rejects anything larger on reserve. */
const MAX_UPLOAD_BYTES = 10_485_760;
/** Images only here — a verification document's PDF makes no sense as a
 * product photo, even though the media module itself would accept one. */
const ALLOWED_IMAGE_TYPES = backendMediaTypes.filter((type) =>
  type.startsWith('image/'),
);

export type UploadedImage = { id: string; fileName: string };
export type UploadImageResult =
  | { status: 'ok'; image: UploadedImage }
  | { status: 'error'; message: string };

function isAllowedImageType(value: string): value is BackendMediaType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

/**
 * Uploads one photo ahead of submitting the product.
 *
 * Called directly from the form's file input rather than through
 * `useActionState` — the caller needs the created asset's id back to hold
 * onto, not just a pass/fail `FormState`.
 */
export async function uploadProductImageAction(
  formData: FormData,
): Promise<UploadImageResult> {
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a file to upload.' };
  }

  if (!isAllowedImageType(file.type)) {
    return {
      status: 'error',
      message: `Use one of: ${ALLOWED_IMAGE_TYPES.join(', ')}.`,
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      status: 'error',
      message: `That file is ${Math.round(file.size / 1_048_576)}MB; the limit is ${Math.round(MAX_UPLOAD_BYTES / 1_048_576)}MB.`,
    };
  }

  try {
    const upload = await backendReserveUpload(apiClient, {
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
    });

    await backendUploadMediaContent(apiClient, upload, file, file.name);

    return {
      status: 'ok',
      image: { id: upload.asset.id, fileName: file.name },
    };
  } catch (error) {
    return {
      status: 'error',
      message: toFormState(error).message ?? 'Upload failed.',
    };
  }
}

/**
 * Submits a brand-new product: creates it (Draft, Pending review), adds its
 * opening variant, then attaches every uploaded photo in order — the first
 * one marked primary. Three calls in sequence, same shape as an offer's own
 * create-then-price, just one step longer for the extra photo attach.
 */
export async function submitProductAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get('name') ?? '').trim();
  const slug = String(formData.get('slug') ?? '').trim();
  const skuCode = String(formData.get('skuCode') ?? '').trim();
  const mediaAssetIds = formData
    .getAll('mediaAssetIds')
    .map(String)
    .filter((id) => id !== '');

  if (mediaAssetIds.length === 0) {
    return {
      status: 'error',
      message: 'Upload at least one photo.',
      fieldErrors: { mediaAssetIds: ['Upload at least one photo.'] },
    };
  }

  const description = String(formData.get('description') ?? '').trim();
  const brandId = String(formData.get('brandId') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '').trim();
  const returnWindowDaysRaw = String(
    formData.get('returnWindowDays') ?? '',
  ).trim();
  const variantName = String(formData.get('variantName') ?? '').trim();

  let productId: string;

  try {
    const product = await backendSubmitProduct(apiClient, {
      name,
      slug,
      description: description || undefined,
      brandId: brandId || undefined,
      categoryId: categoryId || undefined,
      isReturnable: formData.get('isReturnable') === 'on',
      returnWindowDays: returnWindowDaysRaw
        ? Number(returnWindowDaysRaw)
        : undefined,
    });
    productId = product.id;

    await backendAddSellerProductVariant(apiClient, productId, {
      skuCode,
      name: variantName || undefined,
    });

    for (const [index, mediaAssetId] of mediaAssetIds.entries()) {
      await backendAttachSellerProductMedia(apiClient, productId, {
        mediaAssetId,
        position: index,
        isPrimary: index === 0,
      });
    }
  } catch (error) {
    return toFormState(error);
  }

  redirect(`/products/submissions/${productId}`);
}
