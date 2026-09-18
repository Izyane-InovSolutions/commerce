'use server';

import { redirect } from 'next/navigation';

import {
  backendApplyAsSeller,
  backendReserveUpload,
  backendResubmitSellerApplication,
  backendUploadMediaContent,
} from '@commerce/api-client';
import {
  backendMediaTypes,
  type BackendMediaType,
  type BackendSellerApplicationInput,
} from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

/** Matches the API's own default; it rejects anything larger on reserve. */
const MAX_UPLOAD_BYTES = 10_485_760;

export type UploadedDocument = { id: string; fileName: string };
export type UploadDocumentResult =
  | { status: 'ok'; document: UploadedDocument }
  | { status: 'error'; message: string };

function isAllowedType(value: string): value is BackendMediaType {
  return (backendMediaTypes as readonly string[]).includes(value);
}

function applicationInput(formData: FormData): BackendSellerApplicationInput {
  return {
    businessName: String(formData.get('businessName') ?? '').trim(),
    registrationNumber: String(formData.get('registrationNumber') ?? '').trim(),
    country: String(formData.get('country') ?? '')
      .trim()
      .toUpperCase(),
    businessAddress: String(formData.get('businessAddress') ?? '').trim(),
    contactEmail: String(formData.get('contactEmail') ?? '').trim(),
    documentIds: formData
      .getAll('documentIds')
      .map(String)
      .filter((id) => id !== ''),
  };
}

/**
 * Uploads one verification document ahead of submitting the application.
 *
 * Called directly from the form's file input rather than through
 * `useActionState` — the caller needs the created asset's id back to hold
 * onto, not just a pass/fail `FormState`.
 */
export async function uploadSellerDocumentAction(
  formData: FormData,
): Promise<UploadDocumentResult> {
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a file to upload.' };
  }

  if (!isAllowedType(file.type)) {
    return {
      status: 'error',
      message: `Use one of: ${backendMediaTypes.join(', ')}.`,
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
      document: { id: upload.asset.id, fileName: file.name },
    };
  } catch (error) {
    return { status: 'error', message: toFormState(error).message ?? 'Upload failed.' };
  }
}

export async function applyAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = applicationInput(formData);

  if (input.documentIds.length === 0) {
    return {
      status: 'error',
      message: 'Upload at least one verification document.',
      fieldErrors: {
        documentIds: ['Upload at least one verification document.'],
      },
    };
  }

  try {
    await backendApplyAsSeller(apiClient, input);
  } catch (error) {
    return toFormState(error);
  }

  redirect('/');
}

export async function resubmitAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = applicationInput(formData);

  if (input.documentIds.length === 0) {
    return {
      status: 'error',
      message: 'Upload at least one verification document.',
      fieldErrors: {
        documentIds: ['Upload at least one verification document.'],
      },
    };
  }

  try {
    await backendResubmitSellerApplication(apiClient, input);
  } catch (error) {
    return toFormState(error);
  }

  redirect('/');
}
