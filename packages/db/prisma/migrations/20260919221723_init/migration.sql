-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'ADMINISTRATIVE_SUPPORT', 'SERVICE_WORKER', 'TRAVELER');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('DRAFT', 'ITINERARY_SUBMITTED', 'DISPATCH_IN_PROGRESS', 'ASSEMBLY_AND_ESCALATION', 'SECURED_AND_INVOICED', 'PENDING_PAYMENT', 'ACTION_REQUIRED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('GUIDE', 'TRANSPORTATION', 'ACCOMMODATION', 'EXPERIENCE');

-- CreateEnum
CREATE TYPE "ServiceItemStatus" AS ENUM ('UNASSIGNED', 'OFFERED', 'ACCEPTED', 'DECLINED', 'TIMEOUT', 'FULFILLED');

-- CreateEnum
CREATE TYPE "SupplierCategory" AS ENUM ('TOUR_GUIDE', 'PRIVATE_DRIVER', 'HOMESTAY_HOST', 'TRANSLATOR');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING_AUDIT', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PaymentRail" AS ENUM ('OPEN_BANKING_SEPA', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('ACCRUED', 'PROCESSING', 'SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('VOUCHER', 'WORK_ORDER', 'INVOICE', 'RECEIPT', 'EMERGENCY_CONTACT');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('TRAVELER', 'OPERATIONS');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TRAVELER',
    "full_name" TEXT,
    "phone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "retention_consent_granted_at" TIMESTAMP(3),
    "anonymized_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "SupplierCategory" NOT NULL,
    "primary_phone" TEXT NOT NULL,
    "provinces_active" TEXT[],
    "vehicle_details" JSONB,
    "rtn_license_number" TEXT NOT NULL,
    "credential_document_url" TEXT,
    "credential_expires_at" TIMESTAMP(3),
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING_AUDIT',
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "booking_code" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'DRAFT',
    "total_currency" TEXT NOT NULL DEFAULT 'EUR',
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "custom_itinerary_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_items" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "supplier_id" UUID,
    "service_type" "ServiceType" NOT NULL,
    "service_date_start" TIMESTAMP(3) NOT NULL,
    "service_date_end" TIMESTAMP(3) NOT NULL,
    "status" "ServiceItemStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "dispatch_deadline" TIMESTAMP(3),
    "offered_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "payout_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payout_status" "PayoutStatus" NOT NULL DEFAULT 'ACCRUED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "gateway_tx_id" TEXT,
    "rail" "PaymentRail" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payout_status" "PayoutStatus" NOT NULL DEFAULT 'ACCRUED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availabilities" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "supplier_id" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_profiles_user_id_key" ON "supplier_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_profiles_rtn_license_number_key" ON "supplier_profiles"("rtn_license_number");

-- CreateIndex
CREATE INDEX "supplier_profiles_verification_status_idx" ON "supplier_profiles"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_booking_code_key" ON "reservations"("booking_code");

-- CreateIndex
CREATE INDEX "reservations_user_id_idx" ON "reservations"("user_id");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "service_items_reservation_id_idx" ON "service_items"("reservation_id");

-- CreateIndex
CREATE INDEX "service_items_supplier_id_idx" ON "service_items"("supplier_id");

-- CreateIndex
CREATE INDEX "service_items_status_idx" ON "service_items"("status");

-- CreateIndex
CREATE INDEX "payment_receipts_reservation_id_idx" ON "payment_receipts"("reservation_id");

-- CreateIndex
CREATE INDEX "documents_reservation_id_idx" ON "documents"("reservation_id");

-- CreateIndex
CREATE INDEX "messages_reservation_id_idx" ON "messages"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "availabilities_supplier_id_date_key" ON "availabilities"("supplier_id", "date");

-- CreateIndex
CREATE INDEX "reviews_reservation_id_idx" ON "reviews"("reservation_id");

-- CreateIndex
CREATE INDEX "incidents_reservation_id_idx" ON "incidents"("reservation_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- AddForeignKey
ALTER TABLE "supplier_profiles" ADD CONSTRAINT "supplier_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
