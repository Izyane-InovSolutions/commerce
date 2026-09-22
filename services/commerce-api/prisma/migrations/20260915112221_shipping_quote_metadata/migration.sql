-- AlterTable
-- Added nullable first so existing rows (pre-dating rate-quote provenance
-- tracking) can be backfilled before the NOT NULL constraint is applied.
ALTER TABLE "shipping_groups" ADD COLUMN     "estimated_delivery_max_days" INTEGER,
ADD COLUMN     "estimated_delivery_min_days" INTEGER,
ADD COLUMN     "quote_expires_at" TIMESTAMP(3),
ADD COLUMN     "quote_id" TEXT;

-- Backfill: existing rows predate quote tracking, so there is no real quote
-- to record. Flag them as a legacy backfill rather than inventing a rate.
UPDATE "shipping_groups"
SET "quote_id" = 'legacy-backfill',
    "quote_expires_at" = "created_at",
    "estimated_delivery_min_days" = 2,
    "estimated_delivery_max_days" = 5
WHERE "quote_id" IS NULL;

-- AlterTable
ALTER TABLE "shipping_groups"
  ALTER COLUMN "estimated_delivery_max_days" SET NOT NULL,
  ALTER COLUMN "estimated_delivery_min_days" SET NOT NULL,
  ALTER COLUMN "quote_expires_at" SET NOT NULL,
  ALTER COLUMN "quote_id" SET NOT NULL;
