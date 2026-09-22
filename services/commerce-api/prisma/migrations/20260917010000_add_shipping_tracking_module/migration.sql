-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING_BOOKING', 'BOOKED', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'EXCEPTION', 'RETURN_TO_SENDER', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrackingEventSource" AS ENUM ('CARRIER_WEBHOOK', 'CARRIER_POLL', 'ADMIN_MANUAL', 'ADMIN_CORRECTION');

-- CreateEnum
CREATE TYPE "CarrierWebhookDeliveryStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- AlterTable: shipping_groups gains carrier identity. provider_code/carrier_code
-- default to the existing zone-rate provider's own manual carrier; method_code/
-- method_name are added nullable, backfilled from the pre-existing rate_code,
-- then made required.
ALTER TABLE "shipping_groups" ADD COLUMN "provider_code" VARCHAR(50) NOT NULL DEFAULT 'ZONE';
ALTER TABLE "shipping_groups" ADD COLUMN "carrier_code" VARCHAR(50) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "shipping_groups" ADD COLUMN "method_code" VARCHAR(100);
ALTER TABLE "shipping_groups" ADD COLUMN "method_name" VARCHAR(150);

UPDATE "shipping_groups" SET "method_code" = "rate_code", "method_name" = "rate_code" WHERE "method_code" IS NULL;

ALTER TABLE "shipping_groups" ALTER COLUMN "method_code" SET NOT NULL;
ALTER TABLE "shipping_groups" ALTER COLUMN "method_name" SET NOT NULL;

-- AlterTable
ALTER TABLE "fulfillment_lines" ADD COLUMN "shipment_assigned_quantity" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "shipment_number" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "seller_order_id" UUID NOT NULL,
    "shipping_group_id" UUID NOT NULL,
    "fulfillment_order_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "provider_code" VARCHAR(50) NOT NULL,
    "carrier_code" VARCHAR(50) NOT NULL,
    "method_code" VARCHAR(100) NOT NULL,
    "tracking_reference" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING_BOOKING',
    "estimated_delivery_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "booking_idempotency_key" VARCHAR(64) NOT NULL,
    "booked_at" TIMESTAMP(3),
    "dispatched_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_lines" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "fulfillment_line_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "source" "TrackingEventSource" NOT NULL,
    "provider_event_key" TEXT,
    "raw_status" TEXT,
    "normalized_status" "ShipmentStatus" NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "actor_user_id" UUID,
    "is_correction" BOOLEAN NOT NULL DEFAULT false,
    "correction_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrier_webhook_deliveries" (
    "id" UUID NOT NULL,
    "provider_code" VARCHAR(50) NOT NULL,
    "provider_delivery_id" TEXT,
    "payload_hash" TEXT,
    "status" "CarrierWebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "failure_reason" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrier_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- AlterTable: a fulfillment dispatch always references the one booked
-- shipment whose exact lines it consumes.
ALTER TABLE "fulfillment_dispatches" ADD COLUMN "shipment_id" UUID;

-- Backfill dispatches created while #28 was live without shipment records.
-- Deterministic MD5-derived UUIDs make the data migration reproducible
-- without requiring a database UUID extension.
INSERT INTO "shipments" (
    "id", "shipment_number", "order_id", "seller_order_id",
    "shipping_group_id", "fulfillment_order_id", "warehouse_id",
    "provider_code", "carrier_code", "method_code", "tracking_reference",
    "status", "estimated_delivery_at", "version", "booking_idempotency_key",
    "booked_at", "dispatched_at", "delivered_at", "cancelled_at",
    "created_at", "updated_at"
)
SELECT
    md5('legacy-shipment:' || fd."id"::text)::uuid,
    'LEGACY-' || fd."dispatch_number",
    fo."order_id", fo."seller_order_id", fo."shipping_group_id", fo."id", fo."warehouse_id",
    sg."provider_code", sg."carrier_code", sg."method_code", NULL,
    'DISPATCHED'::"ShipmentStatus", NULL, 0,
    md5('legacy-shipment-booking:' || fd."id"::text),
    fd."created_at", fd."created_at", NULL, NULL,
    fd."created_at", fd."created_at"
FROM "fulfillment_dispatches" fd
JOIN "fulfillment_orders" fo ON fo."id" = fd."fulfillment_order_id"
JOIN "shipping_groups" sg ON sg."id" = fo."shipping_group_id";

INSERT INTO "shipment_lines" (
    "id", "shipment_id", "fulfillment_line_id", "order_item_id", "quantity", "created_at"
)
SELECT
    md5('legacy-shipment-line:' || fdl."id"::text)::uuid,
    md5('legacy-shipment:' || fd."id"::text)::uuid,
    fdl."fulfillment_line_id", fl."order_item_id", fdl."quantity", fdl."created_at"
FROM "fulfillment_dispatch_lines" fdl
JOIN "fulfillment_dispatches" fd ON fd."id" = fdl."fulfillment_dispatch_id"
JOIN "fulfillment_lines" fl ON fl."id" = fdl."fulfillment_line_id";

UPDATE "fulfillment_dispatches"
SET "shipment_id" = md5('legacy-shipment:' || "id"::text)::uuid;

ALTER TABLE "fulfillment_dispatches" ALTER COLUMN "shipment_id" SET NOT NULL;

-- Existing dispatch quantities predate shipment assignment. Seed the new
-- counter before installing the stronger quantity-chain constraint below.
UPDATE "fulfillment_lines"
SET "shipment_assigned_quantity" = GREATEST("shipment_assigned_quantity", "dispatched_quantity");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_shipment_number_key" ON "shipments"("shipment_number");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_booking_idempotency_key_key" ON "shipments"("booking_idempotency_key");

-- CreateIndex
CREATE INDEX "shipments_order_id_idx" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "shipments_seller_order_id_idx" ON "shipments"("seller_order_id");

-- CreateIndex
CREATE INDEX "shipments_fulfillment_order_id_idx" ON "shipments"("fulfillment_order_id");

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_lines_shipment_id_fulfillment_line_id_key" ON "shipment_lines"("shipment_id", "fulfillment_line_id");

-- CreateIndex
CREATE INDEX "shipment_lines_fulfillment_line_id_idx" ON "shipment_lines"("fulfillment_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_events_shipment_id_source_provider_event_key_key" ON "tracking_events"("shipment_id", "source", "provider_event_key");

-- CreateIndex
CREATE INDEX "tracking_events_shipment_id_occurred_at_idx" ON "tracking_events"("shipment_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "carrier_webhook_deliveries_provider_code_provider_delivery__key" ON "carrier_webhook_deliveries"("provider_code", "provider_delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "carrier_webhook_deliveries_provider_code_payload_hash_key" ON "carrier_webhook_deliveries"("provider_code", "payload_hash");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_dispatches_shipment_id_key" ON "fulfillment_dispatches"("shipment_id");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_seller_order_id_fkey" FOREIGN KEY ("seller_order_id") REFERENCES "seller_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shipping_group_id_fkey" FOREIGN KEY ("shipping_group_id") REFERENCES "shipping_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_fulfillment_order_id_fkey" FOREIGN KEY ("fulfillment_order_id") REFERENCES "fulfillment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_fulfillment_line_id_fkey" FOREIGN KEY ("fulfillment_line_id") REFERENCES "fulfillment_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_dispatches" ADD CONSTRAINT "fulfillment_dispatches_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: quantity invariants are not expressible in the Prisma
-- schema DSL, so they are hand-authored here (same convention as the
-- fulfillment_lines checks added in 20260916232238_add_fulfillment_module).
-- Application code must already enforce these before writing; these are the
-- last line of defense against a bug or a direct write bypassing
-- FulfillmentsService/ShipmentsService.
ALTER TABLE "fulfillment_lines" DROP CONSTRAINT "fulfillment_lines_quantity_chain_check";

ALTER TABLE "fulfillment_lines" ADD CONSTRAINT "fulfillment_lines_quantity_chain_check"
  CHECK (
    dispatched_quantity >= 0
    AND dispatched_quantity <= shipment_assigned_quantity
    AND shipment_assigned_quantity <= packed_quantity
    AND packed_quantity <= picked_quantity
    AND picked_quantity <= allocated_quantity
  );
