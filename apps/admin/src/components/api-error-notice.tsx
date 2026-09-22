import { ApiError, ApiUnreachableError } from '@commerce/api-client';

/**
 * Explains a failed read without taking down the whole page.
 *
 * A portal is often the first place a backend problem shows up, so the notice
 * names the correlation id the API was given for the failed request.
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
      className="border-destructive/40 bg-destructive/10 space-y-1 rounded-xl border px-4 py-3"
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
