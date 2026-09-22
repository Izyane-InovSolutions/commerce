/**
 * The path prefix this portal is served under.
 *
 * All three apps share one origin on Vercel — the root `vercel.json` routes
 * `/seller/*` to this service, and Vercel hands the service the *original*
 * path, so Next has to be told to expect the prefix. `next.config.ts` sets
 * `basePath` to this value, and it must be kept in step with both that file
 * and the rewrite in `vercel.json`.
 *
 * Next applies `basePath` to `<Link>`, `redirect()` and config rewrites on its
 * own. It does *not* apply it to a URL built by hand — `NextResponse.redirect`
 * or a cookie's `path` — which is what this constant is for.
 */
export const BASE_PATH = '/seller';
