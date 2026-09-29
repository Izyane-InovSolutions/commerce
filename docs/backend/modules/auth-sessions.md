# Session management

All routes use `/api/v1/auth` and require a bearer access token. They operate only on the authenticated user's sessions. No frontend changes are required to deploy these additions.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/sessions` | Lists active, unexpired sessions, newest first. |
| DELETE | `/sessions/:id` | Revokes the selected login family, including a replacement created after the list was loaded. Returns 204; unknown or foreign IDs return 404. |
| DELETE | `/sessions/others` | Revokes all other login families and preserves the caller's family. Returns 204. |

The session list retains `id`, `createdAt`, and `expiresAt`, and adds:

- `signedInAt`: the original login time, preserved across rotation.
- `lastUsedAt`: recent authenticated API activity, updated at most once per minute, or the replacement session's creation time.
- `ipAddress` and `userAgent`: nullable metadata received by the API when credentials are issued. These are descriptive hints, not proof of identity or physical location. User agents are limited to 512 characters. If Next.js sends its own user agent or IP, that is what the API sees; browser metadata forwarding remains frontend integration work.
- `isCurrent`: identifies the caller's login family, including if it rotated during the request.

Token hashes, encrypted recovery credentials, and refresh tokens are never included in this list. Refresh preserves existing IP/user-agent metadata when replacement metadata is absent. Revocation clears recovery credentials and marks rotated ancestors as intentionally revoked so their retries cannot trigger theft detection against unrelated logins.

Individual and bulk revocation share the per-user transaction lock used by refresh. Revoked access tokens fail immediately because authentication checks the backing database session on every request. Revocations are audited in the same transaction and repeated requests do not create duplicate audit events when nothing remains to revoke.

The existing session columns support this change; no migration or new environment variables are needed. PostgreSQL concurrency tests require `TEST_DATABASE_URL` and `TEST_DATABASE_NAME` (ending in `_test`), supplied through `services/commerce-api/.env.integration` or environment variables. Run `npm run test:integration --workspace=@commerce/commerce-api -- test/auth-concurrency.integration-spec.ts` against that dedicated test database.
