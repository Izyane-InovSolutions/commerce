'use server';

import { revalidatePath } from 'next/cache';

import {
  backendAttachProductMedia,
  backendDetachProductMedia,
  backendGetProduct,
  backendReserveUpload,
  backendUpdateProductMedia,
  backendUploadMediaContent,
} from '@commerce/api-client';
import { backendMediaTypes, type BackendMediaType } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

/** Matches the API's own default; it rejects anything larger on reserve. */
const MAX_UPLOAD_BYTES = 10_485_760;

function isAllowedType(value: string): value is BackendMediaType {
  return (backendMediaTypes as readonly string[]).includes(value);
}

function revalidateProduct(productId: string): void {
  revalidatePath(`/catalog/${productId}`);
  revalidatePath('/catalog');
}

/**
 * Uploads an image and attaches it to the product.
 *
 * Three calls, not one: the API reserves an asset, takes the bytes against
 * that reservation, and only then lets it be attached. Doing it here rather
 * than from the browser keeps the admin's bearer token on the server — the
 * signed upload URL is scoped to the asset, but still needs authentication.
 *
 * The first image on a product becomes its primary one, since a product with
 * images but none marked primary would show nothing on the storefront.
 */
export async function uploadProductImageAction(
  productId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return {
      status: 'error',
      message: 'Choose an image to upload.',
      fieldErrors: { file: ['Choose a file.'] },
    };
  }

  const mimeType = file.type;

  if (!isAllowedType(mimeType)) {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: {
        file: [`Use one of: ${backendMediaTypes.join(', ')}.`],
      },
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: {
        file: [
          `That file is ${Math.round(file.size / 1_048_576)}MB; the limit is ${Math.round(MAX_UPLOAD_BYTES / 1_048_576)}MB.`,
        ],
      },
    };
  }

  try {
    const existing = await backendGetProduct(apiClient, productId);

    const upload = await backendReserveUpload(apiClient, {
      fileName: file.name,
      mimeType,
      byteSize: file.size,
    });

    await backendUploadMediaContent(apiClient, upload, file, file.name);

    await backendAttachProductMedia(apiClient, productId, {
      mediaAssetId: upload.asset.id,
      position: existing.media.length,
      isPrimary: existing.media.length === 0,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateProduct(productId);
  return { status: 'idle', message: 'Image added.' };
}

/** Makes one image the one the storefront leads with. */
export async function setPrimaryImageAction(
  productId: string,
  mediaId: string,
): Promise<FormState> {
  try {
    await backendUpdateProductMedia(apiClient, productId, mediaId, {
      isPrimary: true,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateProduct(productId);
  return { status: 'idle', message: 'Primary image updated.' };
}

/**
 * Takes an image off the product.
 *
 * The asset itself is left in place: it may be attached to something else,
 * and the media module decides when it can actually be removed.
 */
export async function removeProductImageAction(
  productId: string,
  mediaId: string,
): Promise<FormState> {
  try {
    await backendDetachProductMedia(apiClient, productId, mediaId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateProduct(productId);
  return { status: 'idle', message: 'Image removed.' };
}
