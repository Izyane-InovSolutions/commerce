-- CreateEnum
CREATE TYPE "ProductSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "created_by_seller_id" UUID,
ADD COLUMN     "review_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" UUID,
ADD COLUMN     "submission_status" "ProductSubmissionStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateIndex
CREATE INDEX "products_created_by_seller_id_submission_status_idx" ON "products"("created_by_seller_id", "submission_status");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_seller_id_fkey" FOREIGN KEY ("created_by_seller_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
