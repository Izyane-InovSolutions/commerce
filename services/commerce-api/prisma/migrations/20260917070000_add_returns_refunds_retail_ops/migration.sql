-- CreateEnum
CREATE TYPE "ReturnReasonCode" AS ENUM ('CUSTOMER_REMORSE', 'WRONG_ITEM', 'DAMAGED', 'DEFECTIVE', 'NOT_AS_DESCRIBED', 'SIZE_FIT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'RECEIVING', 'RECEIVED', 'INSPECTING', 'CLOSED_NO_REFUND', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_FAILED');

-- CreateEnum
CREATE TYPE "ReturnDisposition" AS ENUM ('RESTOCK', 'QUARANTINE', 'DAMAGED', 'DISPOSE');

-- CreateEnum
CREATE TYPE "RefundCaseSource" AS ENUM ('RETURN', 'FULFILLMENT_CANCELLATION', 'ADMIN');

-- CreateEnum
CREATE TYPE "RefundCaseStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED', 'RECONCILIATION_REQUIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "inventory_records" ADD COLUMN     "reorder_point" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "is_returnable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "return_window_days" INTEGER;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "refund_case_id" UUID;

-- CreateTable
CREATE TABLE "return_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "warehouse_id" UUID,
    "assigned_staff_id" UUID,
    "rma_number" TEXT,
    "rma_instructions" TEXT,
    "rejection_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" UUID NOT NULL,
    "return_request_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason_code" "ReturnReasonCode" NOT NULL,
    "note" TEXT,
    "unit_amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "return_window_days" INTEGER NOT NULL,
    "eligible_until" TIMESTAMP(3) NOT NULL,
    "delivered_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_item_allocations" (
    "id" UUID NOT NULL,
    "return_item_id" UUID NOT NULL,
    "shipment_line_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_item_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_receipts" (
    "id" UUID NOT NULL,
    "return_request_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "posted_by_user_id" UUID NOT NULL,
    "is_closing" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_receipt_lines" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "return_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_inspections" (
    "id" UUID NOT NULL,
    "return_request_id" UUID NOT NULL,
    "inspected_by_user_id" UUID NOT NULL,
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_inspection_lines" (
    "id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "return_item_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "accepted_quantity" INTEGER NOT NULL DEFAULT 0,
    "disposition" "ReturnDisposition",
    "rejected_quantity" INTEGER NOT NULL DEFAULT 0,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_inspection_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_events" (
    "id" UUID NOT NULL,
    "return_request_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actor_user_id" UUID,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_cases" (
    "id" UUID NOT NULL,
    "seller_order_id" UUID NOT NULL,
    "source" "RefundCaseSource" NOT NULL,
    "return_request_id" UUID,
    "status" "RefundCaseStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "shipping_amount" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_case_items" (
    "id" UUID NOT NULL,
    "refund_case_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "return_item_id" UUID,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_case_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_events" (
    "id" UUID NOT NULL,
    "refund_case_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_rma_number_key" ON "return_requests"("rma_number");

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_idempotency_key_key" ON "return_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "return_requests_user_id_idx" ON "return_requests"("user_id");

-- CreateIndex
CREATE INDEX "return_requests_assigned_staff_id_idx" ON "return_requests"("assigned_staff_id");

-- CreateIndex
CREATE INDEX "return_requests_status_idx" ON "return_requests"("status");

-- CreateIndex
CREATE INDEX "return_items_return_request_id_idx" ON "return_items"("return_request_id");

-- CreateIndex
CREATE INDEX "return_items_order_item_id_idx" ON "return_items"("order_item_id");

-- CreateIndex
CREATE INDEX "return_item_allocations_return_item_id_idx" ON "return_item_allocations"("return_item_id");

-- CreateIndex
CREATE INDEX "return_item_allocations_shipment_line_id_idx" ON "return_item_allocations"("shipment_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_receipts_idempotency_key_key" ON "return_receipts"("idempotency_key");

-- CreateIndex
CREATE INDEX "return_receipts_return_request_id_idx" ON "return_receipts"("return_request_id");

-- CreateIndex
CREATE INDEX "return_receipt_lines_receipt_id_idx" ON "return_receipt_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "return_receipt_lines_return_item_id_idx" ON "return_receipt_lines"("return_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_inspections_idempotency_key_key" ON "return_inspections"("idempotency_key");

-- CreateIndex
CREATE INDEX "return_inspections_return_request_id_idx" ON "return_inspections"("return_request_id");

-- CreateIndex
CREATE INDEX "return_inspection_lines_inspection_id_idx" ON "return_inspection_lines"("inspection_id");

-- CreateIndex
CREATE INDEX "return_inspection_lines_return_item_id_idx" ON "return_inspection_lines"("return_item_id");

-- CreateIndex
CREATE INDEX "return_events_return_request_id_idx" ON "return_events"("return_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "refund_cases_idempotency_key_key" ON "refund_cases"("idempotency_key");

-- CreateIndex
CREATE INDEX "refund_cases_seller_order_id_idx" ON "refund_cases"("seller_order_id");

-- CreateIndex
CREATE INDEX "refund_cases_return_request_id_idx" ON "refund_cases"("return_request_id");

-- CreateIndex
CREATE INDEX "refund_cases_status_idx" ON "refund_cases"("status");

-- CreateIndex
CREATE INDEX "refund_case_items_refund_case_id_idx" ON "refund_case_items"("refund_case_id");

-- CreateIndex
CREATE INDEX "refund_events_refund_case_id_idx" ON "refund_events"("refund_case_id");

-- CreateIndex
CREATE INDEX "refunds_refund_case_id_idx" ON "refunds"("refund_case_id");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_refund_case_id_fkey" FOREIGN KEY ("refund_case_id") REFERENCES "refund_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_item_allocations" ADD CONSTRAINT "return_item_allocations_return_item_id_fkey" FOREIGN KEY ("return_item_id") REFERENCES "return_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_item_allocations" ADD CONSTRAINT "return_item_allocations_shipment_line_id_fkey" FOREIGN KEY ("shipment_line_id") REFERENCES "shipment_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_receipts" ADD CONSTRAINT "return_receipts_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_receipts" ADD CONSTRAINT "return_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_receipts" ADD CONSTRAINT "return_receipts_posted_by_user_id_fkey" FOREIGN KEY ("posted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_receipt_lines" ADD CONSTRAINT "return_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "return_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_receipt_lines" ADD CONSTRAINT "return_receipt_lines_return_item_id_fkey" FOREIGN KEY ("return_item_id") REFERENCES "return_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_inspections" ADD CONSTRAINT "return_inspections_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_inspections" ADD CONSTRAINT "return_inspections_inspected_by_user_id_fkey" FOREIGN KEY ("inspected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_inspection_lines" ADD CONSTRAINT "return_inspection_lines_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "return_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_inspection_lines" ADD CONSTRAINT "return_inspection_lines_return_item_id_fkey" FOREIGN KEY ("return_item_id") REFERENCES "return_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_inspection_lines" ADD CONSTRAINT "return_inspection_lines_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_seller_order_id_fkey" FOREIGN KEY ("seller_order_id") REFERENCES "seller_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_case_items" ADD CONSTRAINT "refund_case_items_refund_case_id_fkey" FOREIGN KEY ("refund_case_id") REFERENCES "refund_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_case_items" ADD CONSTRAINT "refund_case_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_case_items" ADD CONSTRAINT "refund_case_items_return_item_id_fkey" FOREIGN KEY ("return_item_id") REFERENCES "return_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_events" ADD CONSTRAINT "refund_events_refund_case_id_fkey" FOREIGN KEY ("refund_case_id") REFERENCES "refund_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill pre-#30 Refund rows into legacy ADMIN RefundCase obligations, one
-- RefundCase per existing Refund, so all refund money flows through the
-- RefundCase model going forward.
INSERT INTO "refund_cases" (id, seller_order_id, source, status, amount, shipping_amount, currency, reason, version, idempotency_key, created_at, updated_at)
SELECT
  gen_random_uuid(),
  r.seller_order_id,
  'ADMIN',
  r.status::text::"RefundCaseStatus",
  r.amount,
  0,
  r.currency,
  r.reason,
  0,
  'legacy-refund-' || r.id::text,
  r.created_at,
  r.updated_at
FROM "refunds" r
WHERE r.refund_case_id IS NULL;

UPDATE "refunds" r
SET refund_case_id = rc.id
FROM "refund_cases" rc
WHERE rc.idempotency_key = 'legacy-refund-' || r.id::text
  AND r.refund_case_id IS NULL;
