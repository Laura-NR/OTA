-- CreateEnum
CREATE TYPE "CustomRequestStatus" AS ENUM ('OPEN', 'CONVERTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProposalLineKind" AS ENUM ('TRANSPORT', 'LODGING', 'GUIDES', 'ACTIVITIES', 'MEALS', 'INSURANCE', 'FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProposalLineUnit" AS ENUM ('PER_PERSON', 'PER_BOOKING', 'PER_NIGHT', 'PER_DAY', 'PER_GROUP');

-- CreateTable
CREATE TABLE "custom_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "CustomRequestStatus" NOT NULL DEFAULT 'OPEN',
    "locale" TEXT,
    "payload" JSONB NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "assigned_to_id" UUID,
    "accepted_version_id" UUID,
    "reservation_id" UUID,
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_versions" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "total" DECIMAL(10,2) NOT NULL,
    "per_person" DECIMAL(10,2),
    "valid_until" TIMESTAMP(3) NOT NULL,
    "document" JSONB NOT NULL,
    "terms" JSONB,
    "pdf_key" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_price_lines" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "kind" "ProposalLineKind" NOT NULL,
    "unit" "ProposalLineUnit" NOT NULL DEFAULT 'PER_BOOKING',
    "label" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "unit_amount" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "position" INTEGER NOT NULL DEFAULT 0,
    "service_type" "ServiceType",
    "province" TEXT,
    "service_date_start" DATE,
    "service_date_end" DATE,
    "inventory_item_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_price_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_requests_reference_key" ON "custom_requests"("reference");

-- CreateIndex
CREATE INDEX "custom_requests_user_id_created_at_idx" ON "custom_requests"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_accepted_version_id_key" ON "proposals"("accepted_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_reservation_id_key" ON "proposals"("reservation_id");

-- CreateIndex
CREATE INDEX "proposals_status_created_at_idx" ON "proposals"("status", "created_at");

-- CreateIndex
CREATE INDEX "proposals_request_id_idx" ON "proposals"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_versions_proposal_id_version_key" ON "proposal_versions"("proposal_id", "version");

-- CreateIndex
CREATE INDEX "proposal_price_lines_version_id_position_idx" ON "proposal_price_lines"("version_id", "position");

-- AddForeignKey
ALTER TABLE "custom_requests" ADD CONSTRAINT "custom_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "custom_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_accepted_version_id_fkey" FOREIGN KEY ("accepted_version_id") REFERENCES "proposal_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_price_lines" ADD CONSTRAINT "proposal_price_lines_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "proposal_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_price_lines" ADD CONSTRAINT "proposal_price_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
