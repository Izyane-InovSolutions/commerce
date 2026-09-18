-- DropIndex
DROP INDEX "ledger_entries_seller_id_type_reference_type_reference_id_idx";

-- Precondition: abort instead of silently deleting financial data if
-- duplicate (seller_id, type, reference_type, reference_id) rows already
-- exist. A true duplicate here means an existing double-booked sale or
-- refund, which needs a manual, audited correction before this constraint
-- can be added safely.
DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT count(*) INTO duplicate_count FROM (
    SELECT seller_id, type, reference_type, reference_id
    FROM ledger_entries
    GROUP BY seller_id, type, reference_type, reference_id
    HAVING count(*) > 1
  ) AS duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % duplicate (seller_id, type, reference_type, reference_id) group(s) exist in ledger_entries; resolve them manually before adding the unique constraint', duplicate_count;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "idempotency_key" UUID,
ADD COLUMN     "recorded_by_user_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_seller_id_type_reference_type_reference_id_key" ON "ledger_entries"("seller_id", "type", "reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_idempotency_key_key" ON "payouts"("idempotency_key");

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
