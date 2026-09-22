-- AlterTable
ALTER TABLE "orders"
  ADD COLUMN "shipping_amount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "seller_orders"
  ADD COLUMN "shipping_amount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "order_items"
  ADD COLUMN "shipping_group_id" UUID;

-- CreateTable
CREATE TABLE "shipping_groups" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "seller_order_id" UUID NOT NULL,
    "fulfillment_mode" "OfferFulfillmentMode" NOT NULL,
    "service_level" VARCHAR(50) NOT NULL,
    "rate_code" VARCHAR(100) NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "shipping_amount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_groups_pkey" PRIMARY KEY ("id")
);

-- Backfill a zero-cost shipping snapshot for order items created before this
-- migration. The deterministic UUID makes the migration repeatable in shadow
-- databases and avoids requiring a database UUID extension.
INSERT INTO "shipping_groups" (
  "id", "order_id", "seller_order_id", "fulfillment_mode",
  "service_level", "rate_code", "subtotal", "shipping_amount", "total", "currency"
)
SELECT
  md5(so."id"::text || ':' || offer."fulfillment_mode"::text)::uuid,
  so."order_id",
  so."id",
  offer."fulfillment_mode",
  'STANDARD',
  'FREE_STANDARD_V1',
  SUM(oi."line_total")::integer,
  0,
  SUM(oi."line_total")::integer,
  so."currency"
FROM "seller_orders" so
JOIN "order_items" oi ON oi."seller_order_id" = so."id"
JOIN "offers" offer ON offer."id" = oi."offer_id"
GROUP BY so."id", so."order_id", offer."fulfillment_mode", so."currency";

UPDATE "order_items" oi
SET "shipping_group_id" = sg."id"
FROM "shipping_groups" sg, "offers" offer
WHERE oi."seller_order_id" = sg."seller_order_id"
  AND offer."id" = oi."offer_id"
  AND offer."fulfillment_mode" = sg."fulfillment_mode";

-- CreateIndex
CREATE UNIQUE INDEX "shipping_groups_seller_order_id_fulfillment_mode_key"
  ON "shipping_groups"("seller_order_id", "fulfillment_mode");

-- CreateIndex
CREATE INDEX "shipping_groups_order_id_idx" ON "shipping_groups"("order_id");

-- CreateIndex
CREATE INDEX "order_items_shipping_group_id_idx" ON "order_items"("shipping_group_id");

-- AddForeignKey
ALTER TABLE "shipping_groups" ADD CONSTRAINT "shipping_groups_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_groups" ADD CONSTRAINT "shipping_groups_seller_order_id_fkey"
  FOREIGN KEY ("seller_order_id") REFERENCES "seller_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shipping_group_id_fkey"
  FOREIGN KEY ("shipping_group_id") REFERENCES "shipping_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
