import { NextResponse, type NextRequest } from 'next/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { ApiError, backendGetSellerDocumentUrl } from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { BASE_PATH } from '@/lib/base-path';
import { env } from '@/lib/env';
import { requireAdmin } from '@/lib/session';

import { resolveSignedUrl, type DocumentProblem } from '../signed-url';

// Loose on purpose: the API's ParseUUIDPipe takes any version, and so must
// this, or a seeded id would 404 here and open fine through the API.
const uuid = z.guid();

/**
 * Opens one of a seller's verification documents.
 *
 * The documents are private media, readable only through a short-lived
 * signed URL that the API issues per request (and audits as a view). Asking
 * for it here, server-side, keeps the admin's bearer token out of the browser
 * and means every click gets a fresh URL — a link rendered into the page would
 * have expired by the time anyone clicked it on a page left open.
 *
 * Admin-only, like the endpoint behind it.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/sellers/[id]/documents/[documentId]'>,
): Promise<NextResponse> {
  await requireAdmin(true);
  const { id, documentId } = await ctx.params;

  if (!uuid.safeParse(id).success || !uuid.safeParse(documentId).success) {
    notFound();
  }

  const backToSeller = (problem: DocumentProblem) =>
    NextResponse.redirect(
      new URL(`${BASE_PATH}/sellers/${id}?document=${problem}`, request.url),
    );

  let signed;
  try {
    signed = await backendGetSellerDocumentUrl(apiClient, id, documentId);
  } catch (error) {
    return backToSeller(
      error instanceof ApiError && error.status === 404 ? 'missing' : 'failed',
    );
  }

  const target = resolveSignedUrl(signed.url, env.apiBaseUrl);
  if (!target) {
    return backToSeller('failed');
  }

  const response = NextResponse.redirect(target);
  // The signed URL is single-use in spirit: never cache the redirect, and do
  // not hand this portal's address to the file host.
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}
