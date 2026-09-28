import { ApiError } from '@commerce/api-client';

/**
 * Rewords a 404 from a route this portal expects the API to serve.
 *
 * A list endpoint has no record to be missing, so a 404 there means the API
 * answering is older than the portal — and Nest's own "Cannot GET …" reads
 * like a bug in the page. The request id survives, so the notice can still be
 * traced to the failing call.
 */
export function explainMissingRoute(error: unknown, feature: string): unknown {
  if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
    return new ApiError(
      `The Commerce API answering this portal does not serve ${feature} yet — it is older than the portal. Deploy a current API and reload.`,
      { status: error.status, requestId: error.requestId, body: error.body },
    );
  }
  return error;
}
