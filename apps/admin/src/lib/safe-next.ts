/**
 * Narrows a caller-supplied `next` to an in-app path.
 *
 * `next` arrives from a form field or a query string, so it is attacker
 * controlled. Handing it to `redirect()` unchecked turns the sign-in page into
 * an open redirect: a link carrying `?next=https://evil.example` sends the
 * user off-site the instant they authenticate, which is the shape a
 * credential-phishing flow wants — the victim really did land on the genuine
 * login form, so nothing looks wrong until they are already somewhere else.
 *
 * Only a rooted single-slash path is honoured. `//host` is protocol-relative
 * and leaves the origin; `/\host` is treated as protocol-relative by some
 * browsers despite the backslash; anything carrying a scheme fails the leading
 * `/` test already.
 */
export function safeNext(rawNext: unknown, fallback: string): string {
  if (typeof rawNext !== 'string' || rawNext === '') {
    return fallback;
  }
  if (!rawNext.startsWith('/')) {
    return fallback;
  }
  if (rawNext.startsWith('//') || rawNext.startsWith('/\\')) {
    return fallback;
  }
  return rawNext;
}
