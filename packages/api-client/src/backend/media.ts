import type {
  BackendAdminProduct,
  BackendMediaUpload,
  BackendReserveUploadInput,
} from '@commerce/contracts';

import type { ApiClient } from '../client.ts';

/**
 * Media uploads.
 *
 * Uploading is three steps, not one: reserve the asset, send the bytes to the
 * signed URL that comes back, then attach the asset to whatever it belongs
 * to. The API splits it this way so the bytes can go straight to storage
 * without the catalog ever holding them.
 */

export function backendReserveUpload(
  client: ApiClient,
  input: BackendReserveUploadInput,
): Promise<BackendMediaUpload> {
  return client.post('/media/uploads', { body: input });
}

/**
 * Turns an API-relative signed URL into a path this client can request.
 *
 * The API signs `/api/v1/media/…`, and the client's base URL already ends in
 * `/api/v1` — sending the signed URL unchanged would ask for it twice.
 */
function signedPath(client: ApiClient, url: string): string {
  const basePath = new URL(client.baseUrl).pathname;
  return url.startsWith(basePath) ? url.slice(basePath.length) : url;
}

/**
 * Sends the bytes.
 *
 * The API checks the upload against its reservation — same MIME type, same
 * exact size — so the file here has to be the one that was reserved.
 */
export async function backendUploadMediaContent(
  client: ApiClient,
  upload: BackendMediaUpload,
  file: Blob,
  fileName: string,
): Promise<void> {
  const body = new FormData();
  body.append('file', file, fileName);

  await client.put(signedPath(client, upload.upload.url), { body });
}

/** Returns the whole product, as every admin catalog write does. */
export function backendAttachProductMedia(
  client: ApiClient,
  productId: string,
  input: { mediaAssetId: string; position?: number; isPrimary?: boolean },
): Promise<BackendAdminProduct> {
  return client.post(`/admin/catalog/products/${productId}/media`, {
    body: input,
  });
}

/** Reorders an image, or makes it the one shown first. */
export function backendUpdateProductMedia(
  client: ApiClient,
  productId: string,
  mediaId: string,
  input: { position?: number; isPrimary?: boolean },
): Promise<BackendAdminProduct> {
  return client.patch(`/admin/catalog/products/${productId}/media/${mediaId}`, {
    body: input,
  });
}

export function backendDetachProductMedia(
  client: ApiClient,
  productId: string,
  mediaId: string,
): Promise<null> {
  return client.delete(`/admin/catalog/products/${productId}/media/${mediaId}`);
}

/** Removes the underlying asset, once nothing is attached to it. */
export function backendDeleteMedia(
  client: ApiClient,
  mediaAssetId: string,
): Promise<null> {
  return client.delete(`/media/${mediaAssetId}`);
}
