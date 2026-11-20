-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('CASH_OFFICE', 'BANK_TRANSFER');

-- AlterTable
ALTER TABLE "service_items" ADD COLUMN     "payout_id" UUID;

-- AlterTable
ALTER TABLE "supplier_profiles" ADD COLUMN     "payout_method" "PayoutMethod";

-- CreateTable
CREATE TABLE "supplier_payouts" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "amount" DECIMAL(10,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_payouts_supplier_id_paid_at_idx" ON "supplier_payouts"("supplier_id", "paid_at");

-- AddForeignKey
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "supplier_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payouts" ADD CONSTRAINT "supplier_payouts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payouts" ADD CONSTRAINT "supplier_payouts_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
