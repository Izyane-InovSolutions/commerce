-- AlterTable
ALTER TABLE "products" ADD COLUMN     "featured_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "products_featured_at_idx" ON "products"("featured_at");
