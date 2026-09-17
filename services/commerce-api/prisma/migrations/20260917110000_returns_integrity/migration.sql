ALTER TABLE "return_requests" ADD COLUMN "request_hash" VARCHAR(64);
ALTER TABLE "return_receipts" ADD COLUMN "request_hash" VARCHAR(64);
ALTER TABLE "return_inspections" ADD COLUMN "request_hash" VARCHAR(64);

CREATE UNIQUE INDEX "return_items_return_request_id_order_item_id_key"
  ON "return_items"("return_request_id", "order_item_id");
CREATE UNIQUE INDEX "return_item_allocations_return_item_id_shipment_line_id_key"
  ON "return_item_allocations"("return_item_id", "shipment_line_id");
CREATE UNIQUE INDEX "return_receipt_lines_receipt_id_return_item_id_key"
  ON "return_receipt_lines"("receipt_id", "return_item_id");
CREATE UNIQUE INDEX "return_inspection_lines_inspection_id_return_item_id_key"
  ON "return_inspection_lines"("inspection_id", "return_item_id");

ALTER TABLE "products" ADD CONSTRAINT "products_return_window_days_check"
  CHECK ("return_window_days" IS NULL OR "return_window_days" >= 0);
ALTER TABLE "inventory_records" ADD CONSTRAINT "inventory_records_reorder_point_check"
  CHECK ("reorder_point" >= 0);
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_quantity_check"
  CHECK ("quantity" > 0 AND "unit_amount" >= 0 AND "return_window_days" >= 0 AND "eligible_until" >= "delivered_at");
ALTER TABLE "return_item_allocations" ADD CONSTRAINT "return_item_allocations_quantity_check"
  CHECK ("quantity" > 0);
ALTER TABLE "return_receipt_lines" ADD CONSTRAINT "return_receipt_lines_quantity_check"
  CHECK ("quantity" > 0);
ALTER TABLE "return_inspection_lines" ADD CONSTRAINT "return_inspection_lines_quantities_check"
  CHECK ("accepted_quantity" >= 0 AND "rejected_quantity" >= 0 AND ("accepted_quantity" + "rejected_quantity") > 0);
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_amounts_check"
  CHECK ("amount" > 0 AND "shipping_amount" >= 0 AND "shipping_amount" <= "amount");
ALTER TABLE "refund_case_items" ADD CONSTRAINT "refund_case_items_amounts_check"
  CHECK ("quantity" > 0 AND "amount" >= 0);
