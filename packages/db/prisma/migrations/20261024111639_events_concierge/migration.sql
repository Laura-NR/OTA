-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventAccess" AS ENUM ('ALLOCATIONS_OPEN', 'REQUEST_ONLY', 'PASSES', 'GUIDE_ONLY');

-- CreateEnum
CREATE TYPE "SeatCategoryKind" AS ENUM ('GENERAL', 'NUMBERED', 'PASS');

-- CreateEnum
CREATE TYPE "EventRequestStatus" AS ENUM ('SUBMITTED', 'REQUESTING', 'CONFIRMED', 'UNAVAILABLE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventRequestPath" AS ENUM ('BUILD', 'EXISTING', 'TICKETS_ONLY');

-- AlterEnum
ALTER TYPE "InstalmentKind" ADD VALUE 'TICKETS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PriceLineKind" ADD VALUE 'EVENT_TICKET';
ALTER TYPE "PriceLineKind" ADD VALUE 'CONCIERGE_FEE';

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "access" "EventAccess" NOT NULL,
    "province" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "dates_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirm_by" DATE,
    "source_locale" TEXT NOT NULL DEFAULT 'en',
    "name" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "notes" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_nights" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "venue" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "event_nights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_seat_categories" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kind" "SeatCategoryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_per_seat" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "position" INTEGER NOT NULL,

    CONSTRAINT "event_seat_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_translations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT,
    "place" TEXT,
    "summary" TEXT,
    "notes" TEXT,
    "nights" JSONB,
    "categories" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "source_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_requests" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "night_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "seats" INTEGER NOT NULL,
    "path" "EventRequestPath" NOT NULL,
    "status" "EventRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "custom_request_id" UUID,
    "reservation_id" UUID,
    "locale" TEXT,
    "notes" TEXT,
    "price_per_seat" DECIMAL(10,2),
    "fee_per_seat" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "closed_reason" TEXT,
    "answered_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_status_ends_on_idx" ON "events"("status", "ends_on");

-- CreateIndex
CREATE UNIQUE INDEX "event_nights_event_id_position_key" ON "event_nights"("event_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "event_seat_categories_event_id_position_key" ON "event_seat_categories"("event_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "event_translations_event_id_locale_key" ON "event_translations"("event_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "event_requests_reference_key" ON "event_requests"("reference");

-- CreateIndex
CREATE INDEX "event_requests_status_created_at_idx" ON "event_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "event_requests_user_id_created_at_idx" ON "event_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "event_requests_reservation_id_idx" ON "event_requests"("reservation_id");

-- AddForeignKey
ALTER TABLE "event_nights" ADD CONSTRAINT "event_nights_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_seat_categories" ADD CONSTRAINT "event_seat_categories_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_requests" ADD CONSTRAINT "event_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_requests" ADD CONSTRAINT "event_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_requests" ADD CONSTRAINT "event_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "event_seat_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_requests" ADD CONSTRAINT "event_requests_custom_request_id_fkey" FOREIGN KEY ("custom_request_id") REFERENCES "custom_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_requests" ADD CONSTRAINT "event_requests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- M10 backstops (Prisma cannot express them); the API checks the same first.
-- An event ends on or after its first day (D2).
ALTER TABLE "events" ADD CONSTRAINT "events_dates_check"
  CHECK ("ends_on" >= "starts_on");
-- An indicative seat price is never negative.
ALTER TABLE "event_seat_categories" ADD CONSTRAINT "event_seat_categories_price_check"
  CHECK ("price_per_seat" IS NULL OR "price_per_seat" >= 0);
-- One request holds 1 to 8 seats; larger groups talk to a specialist (D3).
ALTER TABLE "event_requests" ADD CONSTRAINT "event_requests_seats_check"
  CHECK ("seats" BETWEEN 1 AND 8);
-- Frozen prices are never negative (D6).
ALTER TABLE "event_requests" ADD CONSTRAINT "event_requests_prices_check"
  CHECK (("price_per_seat" IS NULL OR "price_per_seat" >= 0)
     AND ("fee_per_seat" IS NULL OR "fee_per_seat" >= 0));
-- A confirmed request froze both prices and records when. Its booking link is
-- not required: it turns null when the booking is deleted.
ALTER TABLE "event_requests" ADD CONSTRAINT "event_requests_confirmed_check"
  CHECK ("status" <> 'CONFIRMED'
     OR ("confirmed_at" IS NOT NULL AND "price_per_seat" IS NOT NULL AND "fee_per_seat" IS NOT NULL));
-- A closed request records when it closed (the 90-day deletion counts from it, D9).
ALTER TABLE "event_requests" ADD CONSTRAINT "event_requests_closed_check"
  CHECK ("status" NOT IN ('UNAVAILABLE', 'CANCELLED') OR "closed_at" IS NOT NULL);
