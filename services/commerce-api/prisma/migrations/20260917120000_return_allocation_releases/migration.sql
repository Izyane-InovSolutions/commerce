ALTER TABLE "return_item_allocations"
  ADD COLUMN "released_quantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "return_item_allocations"
  ADD CONSTRAINT "return_item_allocations_released_quantity_check"
  CHECK ("released_quantity" >= 0 AND "released_quantity" <= "quantity");
