ALTER TABLE "inventory_records"
  ALTER COLUMN "warehouse_id" DROP NOT NULL,
  ADD COLUMN "offer_id" UUID,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "inventory_records_offer_id_key"
  ON "inventory_records"("offer_id");

CREATE INDEX "inventory_records_offer_id_created_at_idx"
  ON "inventory_records"("offer_id", "created_at");

ALTER TABLE "inventory_records"
  ADD CONSTRAINT "inventory_records_offer_id_fkey"
  FOREIGN KEY ("offer_id") REFERENCES "offers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_records"
  ADD CONSTRAINT "inventory_records_stock_owner_check"
  CHECK (
    ("warehouse_id" IS NOT NULL AND "offer_id" IS NULL)
    OR
    ("warehouse_id" IS NULL AND "offer_id" IS NOT NULL)
  );
