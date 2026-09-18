-- CreateEnum
CREATE TYPE "PayoutAccountMethod" AS ENUM ('BANK', 'MOBILE_MONEY');
CREATE TYPE "PayoutAccountStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'DISABLED');
CREATE TYPE "SellerPayoutStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'RECONCILIATION_REQUIRED');
CREATE TYPE "PayoutAttemptStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED', 'RECONCILIATION_REQUIRED');
CREATE TYPE "PayoutBatchStatus" AS ENUM ('OPEN', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS');

-- Balance buckets and release metadata. Existing ledger proceeds were already
-- available under the old model, so they are marked released during backfill.
ALTER TABLE "ledger_entries"
  ADD COLUMN "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "released_at" TIMESTAMP(3);

UPDATE "ledger_entries"
SET "released_at" = "created_at"
WHERE "type" = 'SALE';

ALTER TABLE "seller_balances"
  ADD COLUMN "held_balance" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pending_payout_balance" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "paid_balance" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "seller_balances"
  ADD CONSTRAINT "seller_balances_held_nonnegative" CHECK ("held_balance" >= 0),
  ADD CONSTRAINT "seller_balances_pending_payout_nonnegative" CHECK ("pending_payout_balance" >= 0),
  ADD CONSTRAINT "seller_balances_paid_nonnegative" CHECK ("paid_balance" >= 0);

CREATE TABLE "seller_payout_accounts" (
  "id" UUID NOT NULL,
  "seller_id" UUID NOT NULL,
  "method" "PayoutAccountMethod" NOT NULL,
  "provider" VARCHAR(100) NOT NULL,
  "account_holder_name" VARCHAR(200) NOT NULL,
  "destination" JSONB NOT NULL,
  "masked_reference" VARCHAR(100) NOT NULL,
  "status" "PayoutAccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "verification_note" VARCHAR(500),
  "verified_by_user_id" UUID,
  "verified_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "seller_payout_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payout_batches" (
  "id" UUID NOT NULL,
  "status" "PayoutBatchStatus" NOT NULL DEFAULT 'OPEN',
  "request_count" INTEGER NOT NULL DEFAULT 0,
  "total_amount" INTEGER NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payout_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payout_batches_totals_nonnegative" CHECK ("request_count" >= 0 AND "total_amount" >= 0)
);

CREATE TABLE "seller_payout_requests" (
  "id" UUID NOT NULL,
  "seller_id" UUID NOT NULL,
  "payout_account_id" UUID NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "status" "SellerPayoutStatus" NOT NULL DEFAULT 'REQUESTED',
  "destination_snapshot" JSONB NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "failure_reason" VARCHAR(1000),
  "cancellation_reason" VARCHAR(500),
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMP(3),
  "resolved_by_user_id" UUID,
  "resolved_at" TIMESTAMP(3),
  "batch_id" UUID,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "seller_payout_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_payout_requests_amount_positive" CHECK ("amount" > 0)
);

CREATE TABLE "payout_attempts" (
  "id" UUID NOT NULL,
  "payout_request_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "provider" VARCHAR(100) NOT NULL,
  "status" "PayoutAttemptStatus" NOT NULL DEFAULT 'PROCESSING',
  "provider_reference" VARCHAR(200),
  "request_payload" JSONB,
  "response_payload" JSONB,
  "failure_reason" VARCHAR(1000),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "payout_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payout_attempts_number_positive" CHECK ("attempt_number" > 0)
);

CREATE TABLE "payout_request_events" (
  "id" UUID NOT NULL,
  "payout_request_id" UUID NOT NULL,
  "action" VARCHAR(100) NOT NULL,
  "from_status" "SellerPayoutStatus",
  "to_status" "SellerPayoutStatus" NOT NULL,
  "actor_user_id" UUID,
  "idempotency_key" UUID,
  "request_hash" VARCHAR(64),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_request_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payouts"
  ADD COLUMN "payout_request_id" UUID,
  ADD COLUMN "provider_reference" VARCHAR(200);

CREATE INDEX "seller_payout_accounts_seller_id_status_idx" ON "seller_payout_accounts"("seller_id", "status");
CREATE INDEX "payout_batches_status_created_at_idx" ON "payout_batches"("status", "created_at");
CREATE UNIQUE INDEX "seller_payout_requests_idempotency_key_key" ON "seller_payout_requests"("idempotency_key");
CREATE INDEX "seller_payout_requests_seller_id_created_at_idx" ON "seller_payout_requests"("seller_id", "created_at");
CREATE INDEX "seller_payout_requests_status_created_at_idx" ON "seller_payout_requests"("status", "created_at");
CREATE INDEX "seller_payout_requests_batch_id_idx" ON "seller_payout_requests"("batch_id");
CREATE UNIQUE INDEX "payout_attempts_payout_request_id_attempt_number_key" ON "payout_attempts"("payout_request_id", "attempt_number");
CREATE INDEX "payout_attempts_provider_provider_reference_idx" ON "payout_attempts"("provider", "provider_reference");
CREATE UNIQUE INDEX "payout_request_events_idempotency_key_key" ON "payout_request_events"("idempotency_key");
CREATE INDEX "payout_request_events_payout_request_id_created_at_idx" ON "payout_request_events"("payout_request_id", "created_at");
CREATE UNIQUE INDEX "payouts_payout_request_id_key" ON "payouts"("payout_request_id");

ALTER TABLE "seller_payout_accounts" ADD CONSTRAINT "seller_payout_accounts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seller_payout_accounts" ADD CONSTRAINT "seller_payout_accounts_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seller_payout_requests" ADD CONSTRAINT "seller_payout_requests_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seller_payout_requests" ADD CONSTRAINT "seller_payout_requests_payout_account_id_fkey" FOREIGN KEY ("payout_account_id") REFERENCES "seller_payout_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seller_payout_requests" ADD CONSTRAINT "seller_payout_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seller_payout_requests" ADD CONSTRAINT "seller_payout_requests_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seller_payout_requests" ADD CONSTRAINT "seller_payout_requests_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payout_attempts" ADD CONSTRAINT "payout_attempts_payout_request_id_fkey" FOREIGN KEY ("payout_request_id") REFERENCES "seller_payout_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payout_request_events" ADD CONSTRAINT "payout_request_events_payout_request_id_fkey" FOREIGN KEY ("payout_request_id") REFERENCES "seller_payout_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payout_request_id_fkey" FOREIGN KEY ("payout_request_id") REFERENCES "seller_payout_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
