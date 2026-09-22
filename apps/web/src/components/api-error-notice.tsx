import { ApiError, ApiUnreachableError } from '@commerce/api-client';

/**
 * Explains a failed read without taking down the whole page.
 *
 * The storefront shows the correlation id too: it is what makes a shopper's
 * report of "it broke" traceable in the API's logs.
 */
export function ApiErrorNotice({ error }: { error: unknown }) {
  const requestId =
    error instanceof ApiError || error instanceof ApiUnreachableError
      ? error.requestId
      : undefined;

  const message =
    error instanceof ApiUnreachableError
      ? 'Could not reach the Commerce API.'
      : error instanceof Error
        ? error.message
        : 'Something went wrong.';

  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/10 space-y-1 rounded-2xl border px-4 py-3"
    >
      <p className="text-destructive text-sm font-medium">{message}</p>
      {requestId ? (
        <p className="text-muted-foreground font-mono text-xs">
          Request id {requestId}
        </p>
      ) : null}
    </div>
  );
}
