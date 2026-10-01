-- Order lines and stock journals are historical records. Their parent rows
-- must not be removed by a catalog or warehouse cascade.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "order_items" child
    LEFT JOIN "offers" parent ON parent."id" = child."offer_id"
    WHERE parent."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot protect order history: orphaned order_items exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "inventory_movements" child
    LEFT JOIN "inventory_records" parent
      ON parent."id" = child."inventory_record_id"
    WHERE parent."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot protect stock history: orphaned inventory_movements exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "reservations" child
    LEFT JOIN "inventory_records" parent
      ON parent."id" = child."inventory_record_id"
    WHERE parent."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot protect stock history: orphaned reservations exist';
  END IF;
END $$;

ALTER TABLE "order_items"
  DROP CONSTRAINT "order_items_offer_id_fkey",
  ADD CONSTRAINT "order_items_offer_id_fkey"
    FOREIGN KEY ("offer_id") REFERENCES "offers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movements"
  DROP CONSTRAINT "inventory_movements_inventory_record_id_fkey",
  ADD CONSTRAINT "inventory_movements_inventory_record_id_fkey"
    FOREIGN KEY ("inventory_record_id") REFERENCES "inventory_records"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservations"
  DROP CONSTRAINT "reservations_inventory_record_id_fkey",
  ADD CONSTRAINT "reservations_inventory_record_id_fkey"
    FOREIGN KEY ("inventory_record_id") REFERENCES "inventory_records"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
