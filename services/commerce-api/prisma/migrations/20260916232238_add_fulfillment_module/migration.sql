-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('READY_TO_PICK', 'PICKING', 'PARTIALLY_PICKED', 'PICKED', 'PACKING', 'PARTIALLY_PACKED', 'PACKED', 'PARTIALLY_DISPATCHED', 'DISPATCHED', 'ON_HOLD', 'PARTIALLY_CANCELLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FulfillmentWorkItemType" AS ENUM ('PICK', 'PACK');

-- CreateEnum
CREATE TYPE "FulfillmentWorkItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FulfillmentExceptionType" AS ENUM ('SHORT_PICK', 'DAMAGED', 'MISSING');

-- CreateEnum
CREATE TYPE "FulfillmentExceptionStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "fulfillment_orders" (
    "id" UUID NOT NULL,
    "fulfillment_number" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "seller_order_id" UUID NOT NULL,
    "shipping_group_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'READY_TO_PICK',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "held_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfillment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_lines" (
    "id" UUID NOT NULL,
    "fulfillment_order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "reservation_id" TEXT,
    "inventory_record_id" TEXT,
    "allocated_quantity" INTEGER NOT NULL,
    "picked_quantity" INTEGER NOT NULL DEFAULT 0,
    "packed_quantity" INTEGER NOT NULL DEFAULT 0,
    "dispatched_quantity" INTEGER NOT NULL DEFAULT 0,
    "cancelled_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfillment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_work_items" (
    "id" UUID NOT NULL,
    "fulfillment_order_id" UUID NOT NULL,
    "type" "FulfillmentWorkItemType" NOT NULL,
    "status" "FulfillmentWorkItemStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_user_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfillment_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_dispatches" (
    "id" UUID NOT NULL,
    "fulfillment_order_id" UUID NOT NULL,
    "dispatch_number" TEXT NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL,
    "dispatched_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillment_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_dispatch_lines" (
    "id" UUID NOT NULL,
    "fulfillment_dispatch_id" UUID NOT NULL,
    "fulfillment_line_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillment_dispatch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_exceptions" (
    "id" UUID NOT NULL,
    "fulfillment_order_id" UUID NOT NULL,
    "fulfillment_line_id" UUID NOT NULL,
    "type" "FulfillmentExceptionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "FulfillmentExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_user_id" UUID,
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillment_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_events" (
    "id" UUID NOT NULL,
    "fulfillment_order_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actor_user_id" UUID,
    "idempotency_key" VARCHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_orders_fulfillment_number_key" ON "fulfillment_orders"("fulfillment_number");

-- CreateIndex
CREATE INDEX "fulfillment_orders_order_id_idx" ON "fulfillment_orders"("order_id");

-- CreateIndex
CREATE INDEX "fulfillment_orders_status_priority_idx" ON "fulfillment_orders"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_orders_shipping_group_id_warehouse_id_key" ON "fulfillment_orders"("shipping_group_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_lines_order_item_id_key" ON "fulfillment_lines"("order_item_id");

-- CreateIndex
CREATE INDEX "fulfillment_lines_fulfillment_order_id_idx" ON "fulfillment_lines"("fulfillment_order_id");

-- CreateIndex
CREATE INDEX "fulfillment_work_items_assigned_user_id_status_idx" ON "fulfillment_work_items"("assigned_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_work_items_fulfillment_order_id_type_key" ON "fulfillment_work_items"("fulfillment_order_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_dispatches_dispatch_number_key" ON "fulfillment_dispatches"("dispatch_number");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_dispatches_idempotency_key_key" ON "fulfillment_dispatches"("idempotency_key");

-- CreateIndex
CREATE INDEX "fulfillment_dispatches_fulfillment_order_id_idx" ON "fulfillment_dispatches"("fulfillment_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_dispatch_lines_fulfillment_dispatch_id_fulfillm_key" ON "fulfillment_dispatch_lines"("fulfillment_dispatch_id", "fulfillment_line_id");

-- CreateIndex
CREATE INDEX "fulfillment_exceptions_fulfillment_order_id_status_idx" ON "fulfillment_exceptions"("fulfillment_order_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_events_idempotency_key_key" ON "fulfillment_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "fulfillment_events_fulfillment_order_id_created_at_idx" ON "fulfillment_events"("fulfillment_order_id", "created_at");

-- AddForeignKey
ALTER TABLE "fulfillment_orders" ADD CONSTRAINT "fulfillment_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_orders" ADD CONSTRAINT "fulfillment_orders_seller_order_id_fkey" FOREIGN KEY ("seller_order_id") REFERENCES "seller_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_orders" ADD CONSTRAINT "fulfillment_orders_shipping_group_id_fkey" FOREIGN KEY ("shipping_group_id") REFERENCES "shipping_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_orders" ADD CONSTRAINT "fulfillment_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_lines" ADD CONSTRAINT "fulfillment_lines_fulfillment_order_id_fkey" FOREIGN KEY ("fulfillment_order_id") REFERENCES "fulfillment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_lines" ADD CONSTRAINT "fulfillment_lines_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_lines" ADD CONSTRAINT "fulfillment_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_work_items" ADD CONSTRAINT "fulfillment_work_items_fulfillment_order_id_fkey" FOREIGN KEY ("fulfillment_order_id") REFERENCES "fulfillment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_dispatches" ADD CONSTRAINT "fulfillment_dispatches_fulfillment_order_id_fkey" FOREIGN KEY ("fulfillment_order_id") REFERENCES "fulfillment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_dispatch_lines" ADD CONSTRAINT "fulfillment_dispatch_lines_fulfillment_dispatch_id_fkey" FOREIGN KEY ("fulfillment_dispatch_id") REFERENCES "fulfillment_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_dispatch_lines" ADD CONSTRAINT "fulfillment_dispatch_lines_fulfillment_line_id_fkey" FOREIGN KEY ("fulfillment_line_id") REFERENCES "fulfillment_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_exceptions" ADD CONSTRAINT "fulfillment_exceptions_fulfillment_order_id_fkey" FOREIGN KEY ("fulfillment_order_id") REFERENCES "fulfillment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_exceptions" ADD CONSTRAINT "fulfillment_exceptions_fulfillment_line_id_fkey" FOREIGN KEY ("fulfillment_line_id") REFERENCES "fulfillment_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_events" ADD CONSTRAINT "fulfillment_events_fulfillment_order_id_fkey" FOREIGN KEY ("fulfillment_order_id") REFERENCES "fulfillment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint: quantity invariants are not expressible in the Prisma
-- schema DSL, so they are hand-authored here. Application code must already
-- enforce these before writing; these are the last line of defense against a
-- bug or a direct write bypassing FulfillmentsService.
ALTER TABLE "fulfillment_lines" ADD CONSTRAINT "fulfillment_lines_quantity_chain_check"
  CHECK (
    dispatched_quantity >= 0
    AND dispatched_quantity <= packed_quantity
    AND packed_quantity <= picked_quantity
    AND picked_quantity <= allocated_quantity
  );

ALTER TABLE "fulfillment_lines" ADD CONSTRAINT "fulfillment_lines_cancelled_dispatched_check"
  CHECK (cancelled_quantity + dispatched_quantity <= allocated_quantity);
