DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "inventory_records"
    WHERE "on_hand" < 0
       OR "reserved" < 0
       OR "reserved" > "on_hand"
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Cannot install inventory counter constraints: invalid inventory_records rows exist',
      HINT = 'Query inventory_records where on_hand < 0, reserved < 0, or reserved > on_hand and reconcile those rows before retrying the migration.';
  END IF;
END $$;

ALTER TABLE "inventory_records"
  ADD CONSTRAINT "inventory_records_on_hand_nonnegative_check"
    CHECK ("on_hand" >= 0),
  ADD CONSTRAINT "inventory_records_reserved_nonnegative_check"
    CHECK ("reserved" >= 0),
  ADD CONSTRAINT "inventory_records_reserved_not_above_on_hand_check"
    CHECK ("reserved" <= "on_hand");

CREATE TABLE "inventory_adjustment_receipts" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_adjustment_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_adjustment_receipts_actor_user_id_idempotency_key_key"
  ON "inventory_adjustment_receipts"("actor_user_id", "idempotency_key");

CREATE INDEX "inventory_adjustment_receipts_created_at_idx"
  ON "inventory_adjustment_receipts"("created_at");

ALTER TABLE "inventory_adjustment_receipts"
  ADD CONSTRAINT "inventory_adjustment_receipts_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
