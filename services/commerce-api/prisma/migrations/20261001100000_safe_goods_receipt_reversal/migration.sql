-- Fail before adding constraints if earlier reversals have already damaged
-- the received counters or formed a reversal chain. Those rows need review.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "purchase_order_lines" WHERE "received_quantity" < 0
  ) THEN
    RAISE EXCEPTION 'Cannot protect receipt reversal: negative received quantities exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "goods_receipts" child
    JOIN "goods_receipts" parent ON parent."id" = child."reversal_of_id"
    WHERE parent."reversal_of_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot protect receipt reversal: nested reversals exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "goods_receipts"
    WHERE "reversal_of_id" IS NOT NULL AND "status" <> 'POSTED'
  ) THEN
    RAISE EXCEPTION 'Cannot protect receipt reversal: non-posted reversal rows exist';
  END IF;
END $$;

ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_received_nonnegative_check"
  CHECK ("received_quantity" >= 0);

ALTER TABLE "goods_receipts"
  ADD CONSTRAINT "goods_receipts_reversal_posted_check"
  CHECK ("reversal_of_id" IS NULL OR "status" = 'POSTED');
