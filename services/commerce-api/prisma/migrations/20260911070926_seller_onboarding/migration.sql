-- CreateEnum
CREATE TYPE "SellerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "verification_locked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "sellers" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "business_name" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "business_address" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "status" "SellerStatus" NOT NULL DEFAULT 'PENDING',
    "review_reason" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_documents" (
    "seller_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_documents_pkey" PRIMARY KEY ("seller_id","media_asset_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sellers_owner_user_id_key" ON "sellers"("owner_user_id");

-- CreateIndex
CREATE INDEX "sellers_status_created_at_idx" ON "sellers"("status", "created_at");

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
