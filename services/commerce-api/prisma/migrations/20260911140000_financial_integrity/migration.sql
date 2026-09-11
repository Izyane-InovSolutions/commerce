-- Preserve financial history when a seller is removed.
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_seller_id_fkey";
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seller_balances" DROP CONSTRAINT "seller_balances_seller_id_fkey";
ALTER TABLE "seller_balances" ADD CONSTRAINT "seller_balances_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_seller_id_fkey";
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ledger_entries_seller_id_type_reference_type_reference_id_idx" ON "ledger_entries"("seller_id", "type", "reference_type", "reference_id");
