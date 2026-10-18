-- CreateEnum
CREATE TYPE "DisruptionSeverity" AS ENUM ('MINOR', 'MAJOR', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "DisruptionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TravelerSafety" AS ENUM ('UNKNOWN', 'SAFE', 'NEEDS_HELP');

-- CreateEnum
CREATE TYPE "DisruptionChoiceSource" AS ENUM ('TRAVELER', 'DESK', 'DEFAULT');

-- AlterTable
ALTER TABLE "advisories" ADD COLUMN     "disruption_case_id" UUID;

-- CreateTable
CREATE TABLE "disruption_cases" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "severity" "DisruptionSeverity" NOT NULL,
    "status" "DisruptionStatus" NOT NULL DEFAULT 'OPEN',
    "province" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "policy" TEXT NOT NULL,
    "owner_id" UUID,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disruption_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disruption_steps" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "due" TEXT NOT NULL,
    "done_at" TIMESTAMP(3),
    "done_by_id" UUID,

    CONSTRAINT "disruption_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disruption_options" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,

    CONSTRAINT "disruption_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disruption_case_bookings" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "safety" "TravelerSafety" NOT NULL DEFAULT 'UNKNOWN',
    "last_contact_at" TIMESTAMP(3),
    "safety_note" TEXT,
    "safety_confirmed_by_id" UUID,
    "offer_sent_at" TIMESTAMP(3),
    "offer_deadline" TIMESTAMP(3),
    "default_option_key" TEXT,
    "chosen_option_key" TEXT,
    "choice_source" "DisruptionChoiceSource",
    "chosen_at" TIMESTAMP(3),
    "chosen_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disruption_case_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disruption_cases_reference_key" ON "disruption_cases"("reference");

-- CreateIndex
CREATE INDEX "disruption_cases_status_opened_at_idx" ON "disruption_cases"("status", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "disruption_steps_case_id_position_key" ON "disruption_steps"("case_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "disruption_options_case_id_key_key" ON "disruption_options"("case_id", "key");

-- CreateIndex
CREATE INDEX "disruption_case_bookings_reservation_id_idx" ON "disruption_case_bookings"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "disruption_case_bookings_case_id_reservation_id_key" ON "disruption_case_bookings"("case_id", "reservation_id");

-- AddForeignKey
ALTER TABLE "advisories" ADD CONSTRAINT "advisories_disruption_case_id_fkey" FOREIGN KEY ("disruption_case_id") REFERENCES "disruption_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disruption_cases" ADD CONSTRAINT "disruption_cases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disruption_steps" ADD CONSTRAINT "disruption_steps_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "disruption_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disruption_steps" ADD CONSTRAINT "disruption_steps_done_by_id_fkey" FOREIGN KEY ("done_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disruption_options" ADD CONSTRAINT "disruption_options_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "disruption_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disruption_case_bookings" ADD CONSTRAINT "disruption_case_bookings_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "disruption_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disruption_case_bookings" ADD CONSTRAINT "disruption_case_bookings_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disruption_case_bookings" ADD CONSTRAINT "disruption_case_bookings_safety_confirmed_by_id_fkey" FOREIGN KEY ("safety_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disruption_case_bookings" ADD CONSTRAINT "disruption_case_bookings_chosen_by_id_fkey" FOREIGN KEY ("chosen_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
