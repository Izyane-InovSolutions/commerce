/*
  Warnings:

  - The required column `family_id` was added to the `sessions` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable: family_id/family_created_at are added nullable first because
-- each pre-existing session must be backfilled as its own single-session
-- family (family_id = id, family_created_at = created_at) rather than take
-- Prisma's application-level defaults, which would give every existing row
-- a *different* random family_id/now() and is not what "each existing
-- session becomes its own family" means. Made NOT NULL below once backfilled.
ALTER TABLE "sessions" ADD COLUMN     "family_created_at" TIMESTAMP(3),
ADD COLUMN     "family_id" UUID,
ADD COLUMN     "ip_address" TEXT,
ADD COLUMN     "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "recovery_data" TEXT,
ADD COLUMN     "recovery_expires_at" TIMESTAMP(3),
ADD COLUMN     "replaced_by_session_id" UUID,
ADD COLUMN     "revoked_reason" TEXT,
ADD COLUMN     "user_agent" TEXT;

-- Backfill: each existing session is its own family.
UPDATE "sessions" SET "family_id" = "id", "family_created_at" = "created_at"
WHERE "family_id" IS NULL;

ALTER TABLE "sessions" ALTER COLUMN "family_id" SET NOT NULL,
ALTER COLUMN "family_id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "family_created_at" SET NOT NULL,
ALTER COLUMN "family_created_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "verification_grace_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" UUID NOT NULL,
    "template" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "encrypted_vars" TEXT NOT NULL,
    "encryption_key_id" TEXT NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "email_deliveries_status_idx" ON "email_deliveries"("status");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
