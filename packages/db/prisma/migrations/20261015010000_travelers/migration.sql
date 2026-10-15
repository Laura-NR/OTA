-- CreateEnum
CREATE TYPE "TravelerKind" AS ENUM ('ADULT', 'CHILD', 'INFANT');

-- CreateEnum
CREATE TYPE "PriceLineKind" AS ENUM ('BASE', 'TIER', 'CHILD', 'SINGLE_SUPPLEMENT', 'EXTRA', 'SERVICE', 'FEE');

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "departure_id" UUID,
ADD COLUMN     "party_size" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tier_id" UUID;

-- AlterTable
ALTER TABLE "service_items" ADD COLUMN     "traveler_price" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "reservation_travelers" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "room_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "kind" "TravelerKind" NOT NULL DEFAULT 'ADULT',
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "nationality" TEXT,
    "passport_number_enc" TEXT,
    "passport_expires_at" DATE,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_travelers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_rooms" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_extras" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "package_extra_id" UUID,
    "label" TEXT NOT NULL,
    "unit" "ExtraPriceUnit" NOT NULL DEFAULT 'PER_PERSON',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_amount" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_price_lines" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "traveler_id" UUID,
    "kind" "PriceLineKind" NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "unit_amount" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_price_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservation_travelers_reservation_id_idx" ON "reservation_travelers"("reservation_id");

-- CreateIndex
CREATE INDEX "reservation_travelers_room_id_idx" ON "reservation_travelers"("room_id");

-- CreateIndex
CREATE INDEX "reservation_rooms_reservation_id_idx" ON "reservation_rooms"("reservation_id");

-- CreateIndex
CREATE INDEX "reservation_extras_reservation_id_idx" ON "reservation_extras"("reservation_id");

-- CreateIndex
CREATE INDEX "reservation_price_lines_reservation_id_idx" ON "reservation_price_lines"("reservation_id");

-- CreateIndex
CREATE INDEX "reservations_tier_id_idx" ON "reservations"("tier_id");

-- CreateIndex
CREATE INDEX "reservations_departure_id_idx" ON "reservations"("departure_id");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "package_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "package_departures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_travelers" ADD CONSTRAINT "reservation_travelers_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_travelers" ADD CONSTRAINT "reservation_travelers_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "reservation_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_extras" ADD CONSTRAINT "reservation_extras_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_extras" ADD CONSTRAINT "reservation_extras_package_extra_id_fkey" FOREIGN KEY ("package_extra_id") REFERENCES "package_extras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_price_lines" ADD CONSTRAINT "reservation_price_lines_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_price_lines" ADD CONSTRAINT "reservation_price_lines_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "reservation_travelers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

