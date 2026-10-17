-- CreateEnum
CREATE TYPE "OfacCategory" AS ENUM ('FAMILY_VISITS', 'OFFICIAL_GOVERNMENT_BUSINESS', 'JOURNALISTIC_ACTIVITY', 'PROFESSIONAL_RESEARCH', 'EDUCATIONAL_ACTIVITIES', 'RELIGIOUS_ACTIVITIES', 'PUBLIC_PERFORMANCES', 'SUPPORT_FOR_THE_CUBAN_PEOPLE', 'HUMANITARIAN_PROJECTS', 'PRIVATE_FOUNDATIONS_RESEARCH', 'INFORMATIONAL_MATERIALS', 'AUTHORIZED_EXPORT_TRANSACTIONS');

-- CreateEnum
CREATE TYPE "AffidavitSource" AS ENUM ('ONLINE', 'PAPER');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('TERMS', 'PRIVACY_NOTICE', 'CANCELLATION_POLICY', 'INSURANCE_ACKNOWLEDGEMENT', 'PAYMENT_TERMS', 'MARKETING_EMAIL', 'TRIP_MESSAGES', 'COOKIES_ANALYTICS', 'COOKIES_MARKETING');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('BOOKING', 'ACCOUNT', 'COOKIE_BANNER', 'PAYMENT', 'CUSTOM_REQUEST', 'DESK');

-- AlterTable
ALTER TABLE "reservation_travelers" ADD COLUMN     "us_person" BOOLEAN;

-- CreateTable
CREATE TABLE "traveler_affidavits" (
    "id" UUID NOT NULL,
    "reservation_id" UUID,
    "traveler_id" UUID,
    "supersedes_id" UUID,
    "category" "OfacCategory" NOT NULL,
    "signer_name" TEXT NOT NULL,
    "signer_nationality" TEXT,
    "booking_code" TEXT NOT NULL,
    "travel_start" DATE NOT NULL,
    "travel_end" DATE NOT NULL,
    "statement_version" TEXT NOT NULL,
    "statement_hash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "source" "AffidavitSource" NOT NULL DEFAULT 'ONLINE',
    "document_key" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "recorded_by_id" UUID,
    "signed_at" TIMESTAMP(3) NOT NULL,
    "retain_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traveler_affidavits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "visitor_id" TEXT,
    "reservation_id" UUID,
    "purpose" "ConsentPurpose" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "text_version" TEXT NOT NULL,
    "text_hash" TEXT,
    "source" "ConsentSource" NOT NULL,
    "locale" TEXT,
    "region" TEXT,
    "ip_country" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "traveler_affidavits_supersedes_id_key" ON "traveler_affidavits"("supersedes_id");

-- CreateIndex
CREATE INDEX "traveler_affidavits_reservation_id_idx" ON "traveler_affidavits"("reservation_id");

-- CreateIndex
CREATE INDEX "traveler_affidavits_traveler_id_idx" ON "traveler_affidavits"("traveler_id");

-- CreateIndex
CREATE INDEX "traveler_affidavits_retain_until_idx" ON "traveler_affidavits"("retain_until");

-- CreateIndex
CREATE INDEX "consent_records_user_id_purpose_created_at_idx" ON "consent_records"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "consent_records_visitor_id_idx" ON "consent_records"("visitor_id");

-- CreateIndex
CREATE INDEX "consent_records_reservation_id_idx" ON "consent_records"("reservation_id");

-- AddForeignKey
ALTER TABLE "traveler_affidavits" ADD CONSTRAINT "traveler_affidavits_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_affidavits" ADD CONSTRAINT "traveler_affidavits_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "reservation_travelers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_affidavits" ADD CONSTRAINT "traveler_affidavits_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_affidavits" ADD CONSTRAINT "traveler_affidavits_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "traveler_affidavits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- M3 D2 (hand-written): traveler_affidavits is append-only. A foreign key's
-- ON DELETE SET NULL is performed as an UPDATE, so the only update allowed is
-- one where a link column (booking, traveler, superseded affidavit, recording
-- user) turns null and nothing else changes. A correction is a new row that
-- supersedes the old one; the retention sweep deletes rows past retain_until.
CREATE FUNCTION traveler_affidavits_append_only() RETURNS trigger AS $$
DECLARE
  links CONSTANT text[] := ARRAY['reservation_id', 'traveler_id', 'supersedes_id', 'recorded_by_id'];
BEGIN
  IF (to_jsonb(NEW) - links) = (to_jsonb(OLD) - links)
     AND (NEW.reservation_id IS NULL OR NEW.reservation_id = OLD.reservation_id)
     AND (NEW.traveler_id IS NULL OR NEW.traveler_id = OLD.traveler_id)
     AND (NEW.supersedes_id IS NULL OR NEW.supersedes_id = OLD.supersedes_id)
     AND (NEW.recorded_by_id IS NULL OR NEW.recorded_by_id = OLD.recorded_by_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'traveler_affidavits is append-only; record a superseding affidavit instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER traveler_affidavits_no_update
  BEFORE UPDATE ON traveler_affidavits
  FOR EACH ROW EXECUTE FUNCTION traveler_affidavits_append_only();
