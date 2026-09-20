-- CreateEnum
CREATE TYPE "DispatchOfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'TIMEOUT', 'CANCELLED');

-- CreateTable
CREATE TABLE "dispatch_offers" (
    "id" UUID NOT NULL,
    "service_item_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "status" "DispatchOfferStatus" NOT NULL DEFAULT 'OFFERED',
    "offered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dispatch_offers_service_item_id_idx" ON "dispatch_offers"("service_item_id");

-- CreateIndex
CREATE INDEX "dispatch_offers_supplier_id_idx" ON "dispatch_offers"("supplier_id");

-- CreateIndex
CREATE INDEX "dispatch_offers_status_idx" ON "dispatch_offers"("status");

-- AddForeignKey
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
