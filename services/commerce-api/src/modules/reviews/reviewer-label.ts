// Shared by every public review/rating projection (product reviews,
// storefront ratings) so the "who wrote this" label is computed the same way
// everywhere, without exposing the reviewer's full name or user id.

/**
 * First name plus last initial (e.g. "Jane D."), falling back to
 * "Verified customer" whenever either name is missing or blank once trimmed.
 * Never exposes the full last name or any identifier.
 */
export function formatReviewerLabel(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = firstName?.trim();
  const last = lastName?.trim();

  if (first && last) {
    return `${first} ${last[0]}.`;
  }

  return 'Verified customer';
}
