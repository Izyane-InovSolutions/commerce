-- Correct the lifetime paid projection without modifying ledger history.
-- Block concurrent financial writes while deriving the projection.
BEGIN;
LOCK TABLE seller_balances, payouts IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payouts p JOIN seller_balances b ON b.seller_id = p.seller_id
    WHERE p.currency <> b.currency
  ) THEN
    RAISE EXCEPTION 'Mixed-currency payout history requires manual reconciliation';
  END IF;
END $$;
UPDATE seller_balances b
SET paid_balance = COALESCE((SELECT SUM(p.amount) FROM payouts p WHERE p.seller_id = b.seller_id), 0),
    updated_at = CURRENT_TIMESTAMP;
COMMIT;
