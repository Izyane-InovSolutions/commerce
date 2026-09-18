-- CreateTable
CREATE TABLE "fx_rates" (
    "id" UUID NOT NULL,
    "base_currency" VARCHAR(3) NOT NULL DEFAULT 'ZMW',
    "target_currency" VARCHAR(3) NOT NULL,
    "rate" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'exchangerate-api',
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_target_currency_key" ON "fx_rates"("target_currency");

