-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "display_currency" CHAR(3),
ADD COLUMN     "display_rate" DECIMAL(12,6),
ADD COLUMN     "display_rate_date" DATE,
ADD COLUMN     "display_rate_locked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "display_currency" CHAR(3);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "rate_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "rate" DECIMAL(12,6) NOT NULL,
    "source" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rates_currency_rate_date_idx" ON "exchange_rates"("currency", "rate_date");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_rate_date_currency_key" ON "exchange_rates"("rate_date", "currency");
