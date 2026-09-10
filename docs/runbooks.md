# Backend runbooks

## API does not start

Read the environment validation error first. Confirm PostgreSQL is running on
the port used by `DATABASE_URL`, then run `npm run prisma:deploy --workspace
@commerce/commerce-api`. Use `/api/v1/health/ready` to confirm database access.

## Database migration fails

Do not edit an applied migration. Back up important local data, fix the new
migration or schema, and inspect status with `npx prisma migrate status` from
`services/commerce-api`. The `commerce` and `commerce_shadow` databases must be
different databases.

## Background jobs fail repeatedly

Inspect `background_jobs.last_error`, `attempts`, and `status`. Jobs retry with
backoff and move to `DEAD_LETTER` after `max_attempts`. Fix the handler or input,
then explicitly reset the row to `PENDING`; retain the old error for diagnosis.

## Outbox events are not published

Inspect `outbox_events` ordered by `created_at`. Check `available_at`, attempts,
and `last_error`. Publishing consumers must use the event UUID for idempotency
before marking the row `PUBLISHED`.

## Rotate signing secrets

Changing `JWT_SECRET` invalidates existing access tokens. Existing refresh
sessions can issue new access tokens, so revoke affected sessions when rotating
after a suspected leak. Changing `MEDIA_SIGNING_SECRET` invalidates outstanding
media URLs; clients can request new URLs.

## Local media recovery

Media bytes live under `MEDIA_STORAGE_PATH`; metadata lives in PostgreSQL.
Restore both together. A missing file returns 404 and must not be repaired by
changing its database status without restoring the exact content.
