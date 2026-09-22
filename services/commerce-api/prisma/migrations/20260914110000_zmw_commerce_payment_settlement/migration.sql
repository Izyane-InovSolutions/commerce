CREATE TABLE "payment_settlements" (
    "payment_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "rate" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_settlements_pkey" PRIMARY KEY ("payment_id"),
    CONSTRAINT "payment_settlements_amount_check" CHECK ("amount" > 0)
);

ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve historical foreign prices for audit; never relabel their numbers
-- as kwacha. New prices must use ZMW. Sellers must explicitly reprice old offers.
ALTER TABLE "prices" ADD CONSTRAINT "prices_zmw_currency_check" CHECK ("currency" = 'ZMW') NOT VALID;
