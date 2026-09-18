-- AlterEnum
ALTER TYPE "FulfillmentStatus" ADD VALUE 'AWAITING_ACCEPTANCE';

-- AlterEnum
ALTER TYPE "TrackingEventSource" ADD VALUE 'SELLER_MANUAL';

-- AlterTable
ALTER TABLE "fulfillment_dispatches" ADD COLUMN     "request_hash" VARCHAR(64);

-- AlterTable
ALTER TABLE "fulfillment_events" ADD COLUMN     "request_hash" VARCHAR(64);

-- AlterTable
ALTER TABLE "fulfillment_orders" ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "accepted_by_user_id" UUID,
ALTER COLUMN "warehouse_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "shipments" ALTER COLUMN "warehouse_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tracking_events" ADD COLUMN     "idempotency_key" VARCHAR(64),
ADD COLUMN     "request_hash" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "tracking_events_idempotency_key_key" ON "tracking_events"("idempotency_key");


-- Partial unique constraints not expressible in the Prisma schema DSL
-- (same convention as the hand-added FulfillmentLine CHECK constraints).

-- At most one seller-fulfilled FulfillmentOrder (warehouse_id IS NULL) per
-- shipping group. The existing @@unique([shippingGroupId, warehouseId])
-- does not cover this: Postgres treats every NULL warehouse_id as distinct,
-- so without this index two seller fulfillments could be provisioned for
-- the same shipping group.
CREATE UNIQUE INDEX "fulfillment_orders_seller_shipping_group_key"
  ON "fulfillment_orders"("shipping_group_id")
  WHERE "warehouse_id" IS NULL;

-- (carrierCode, trackingReference) must be unique whenever a tracking
-- reference is actually present — most shipments start with a null
-- reference (assigned later at dispatch), and those must not collide.
CREATE UNIQUE INDEX "shipments_carrier_code_tracking_reference_key"
  ON "shipments"("carrier_code", "tracking_reference")
  WHERE "tracking_reference" IS NOT NULL;
