ALTER TABLE "email_deliveries"
  ALTER COLUMN "encrypted_vars" DROP NOT NULL,
  ADD COLUMN "failed_at" TIMESTAMP(3),
  ADD COLUMN "last_error_code" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
