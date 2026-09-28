/**
 * Where to send the browser for a signed document URL.
 *
 * The API signs a path on its own origin (`/api/v1/media/…?expires=…`), so it
 * is resolved against the API base URL rather than this portal's — the admin
 * app is served under `/admin` and would otherwise ask itself for the file.
 * An absolute URL (a storage bucket, say) passes through. Anything that is
 * not http(s) is refused, since the result becomes a redirect.
 */
export function resolveSignedUrl(url: string, apiBaseUrl: string): URL | null {
  let resolved: URL;
  try {
    resolved = new URL(url, apiBaseUrl);
  } catch {
    return null;
  }

  return resolved.protocol === 'https:' || resolved.protocol === 'http:'
    ? resolved
    : null;
}

/** Why a document could not be opened, as the seller page reads it back. */
export type DocumentProblem = 'missing' | 'failed';

export function documentProblemMessage(
  problem: string | undefined,
): string | null {
  switch (problem) {
    case 'missing':
      return 'That document is no longer available — the seller may have replaced it, or its upload never finished.';
    case 'failed':
      return 'Could not get a link for that document. Try again in a moment.';
    default:
      return null;
  }
}
