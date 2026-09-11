-- New nullable identity fields preserve existing first-party offers.
CREATE TYPE "OfferCondition" AS ENUM ('NEW', 'USED', 'REFURBISHED');
CREATE TYPE "OfferStockSource" AS ENUM ('PLATFORM', 'SELLER');
CREATE TYPE "OfferFulfillmentMode" AS ENUM ('PLATFORM', 'SELLER');

ALTER TABLE "offers"
ADD COLUMN "condition" "OfferCondition" NOT NULL DEFAULT 'NEW',
ADD COLUMN "fulfillment_mode" "OfferFulfillmentMode" NOT NULL DEFAULT 'PLATFORM',
ADD COLUMN "listing_title" VARCHAR(200),
ADD COLUMN "seller_sku" VARCHAR(100),
ADD COLUMN "stock_source" "OfferStockSource" NOT NULL DEFAULT 'PLATFORM',
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "sellers"
ADD COLUMN "description" VARCHAR(2000),
ADD COLUMN "display_name" VARCHAR(120),
ADD COLUMN "storefront_slug" VARCHAR(100);

CREATE UNIQUE INDEX "offers_seller_id_seller_sku_key" ON "offers"("seller_id", "seller_sku");
CREATE UNIQUE INDEX "sellers_storefront_slug_key" ON "sellers"("storefront_slug");
ALTER TABLE "offers" ADD CONSTRAINT "offers_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
