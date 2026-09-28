-- Existing sellers receive a staged 30-day enforcement window. New users
-- have no grace value and must verify before using seller-only operations.
UPDATE "users"
SET "verification_grace_until" = CURRENT_TIMESTAMP + INTERVAL '30 days'
WHERE "role" = 'SELLER'
  AND "email_verified_at" IS NULL
  AND "verification_grace_until" IS NULL;
