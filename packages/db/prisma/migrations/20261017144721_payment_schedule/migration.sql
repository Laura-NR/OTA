-- CreateEnum
CREATE TYPE "InstalmentKind" AS ENUM ('DEPOSIT', 'BALANCE', 'FULL');

-- CreateEnum
CREATE TYPE "InstalmentStatus" AS ENUM ('DUE', 'PAID', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('TRAVELER_CANCELLATION', 'HOST_CANCELLATION', 'FORCE_MAJEURE', 'GOODWILL', 'PRICE_CORRECTION');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "payment_receipts" ADD COLUMN     "fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "instalment_id" UUID;

-- CreateTable
CREATE TABLE "payment_instalments" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "kind" "InstalmentKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "InstalmentStatus" NOT NULL DEFAULT 'DUE',
    "paid_at" TIMESTAMP(3),
    "policy_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_instalments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_proofs" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by_id" UUID,
    "status" "ProofStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "reason" "RefundReason" NOT NULL,
    "note" TEXT NOT NULL,
    "rule" JSONB,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requested_by_id" UUID,
    "provider_refund_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_approvals" (
    "id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "approve" BOOLEAN NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_instalments_status_due_at_idx" ON "payment_instalments"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_instalments_reservation_id_position_key" ON "payment_instalments"("reservation_id", "position");

-- CreateIndex
CREATE INDEX "payment_proofs_status_created_at_idx" ON "payment_proofs"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_proofs_receipt_id_idx" ON "payment_proofs"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "refunds_status_created_at_idx" ON "refunds"("status", "created_at");

-- CreateIndex
CREATE INDEX "refunds_reservation_id_idx" ON "refunds"("reservation_id");

-- CreateIndex
CREATE INDEX "refunds_receipt_id_idx" ON "refunds"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "refund_approvals_refund_id_approver_id_key" ON "refund_approvals"("refund_id", "approver_id");

-- CreateIndex
CREATE INDEX "payment_receipts_instalment_id_idx" ON "payment_receipts"("instalment_id");

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_instalment_id_fkey" FOREIGN KEY ("instalment_id") REFERENCES "payment_instalments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_instalments" ADD CONSTRAINT "payment_instalments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "payment_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "payment_receipts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_approvals" ADD CONSTRAINT "refund_approvals_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_approvals" ADD CONSTRAINT "refund_approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
