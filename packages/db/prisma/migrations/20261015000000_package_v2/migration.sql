-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BookingModel" AS ENUM ('REQUEST', 'INSTANT');

-- CreateEnum
CREATE TYPE "DepartureStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExtraPriceUnit" AS ENUM ('PER_PERSON', 'PER_BOOKING');

-- DropIndex
DROP INDEX "packages_active_idx";

-- AlterTable
ALTER TABLE "package_services" ADD COLUMN     "tier_id" UUID;

-- AlterTable
ALTER TABLE "packages"
ADD COLUMN     "accessibility" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "booking_model" "BookingModel" NOT NULL DEFAULT 'REQUEST',
ADD COLUMN     "cancellation_policy" TEXT,
ADD COLUMN     "content_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "cuba_notes" TEXT,
ADD COLUMN     "deposit_policy" TEXT,
ADD COLUMN     "difficulty" INTEGER,
ADD COLUMN     "excluded" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "group_max" INTEGER,
ADD COLUMN     "group_min" INTEGER,
ADD COLUMN     "included" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lead_time_days" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "seo_description" TEXT,
ADD COLUMN     "seo_title" TEXT,
ADD COLUMN     "source_locale" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tourism_category" "TourismCategory" NOT NULL DEFAULT 'GENERAL';

-- Backfill the new status from the legacy active flag (hand-written; the
-- migration draft in docs/schema-m1-package-v2.md), then drop the old column.
UPDATE "packages"
   SET "status" = CASE WHEN "active" THEN 'PUBLISHED'::"PackageStatus" ELSE 'DRAFT'::"PackageStatus" END,
       "published_at" = CASE WHEN "active" THEN "updated_at" END;

ALTER TABLE "packages" DROP COLUMN "active";

-- CreateTable
CREATE TABLE "package_days" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "day_offset" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "meals" TEXT,

    CONSTRAINT "package_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_tiers" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "price_delta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "single_supplement" DECIMAL(10,2),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_departures" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "capacity" INTEGER NOT NULL,
    "price" DECIMAL(10,2),
    "status" "DepartureStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_departures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_extras" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration_label" TEXT,
    "inventory_item_id" UUID,
    "day_offset" INTEGER,
    "price" DECIMAL(10,2) NOT NULL,
    "price_unit" "ExtraPriceUnit" NOT NULL DEFAULT 'PER_PERSON',
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_media" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "alt_text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "shows_people" BOOLEAN NOT NULL DEFAULT false,
    "consent_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_translations" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "included" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excluded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cuba_notes" TEXT,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "days" JSONB,
    "tiers" JSONB,
    "extras" JSONB,
    "media_alt" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "source_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_slug_redirects" (
    "slug" TEXT NOT NULL,
    "package_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_slug_redirects_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE UNIQUE INDEX "package_days_package_id_day_offset_key" ON "package_days"("package_id", "day_offset");

-- CreateIndex
CREATE UNIQUE INDEX "package_tiers_package_id_code_key" ON "package_tiers"("package_id", "code");

-- CreateIndex
CREATE INDEX "package_departures_start_date_idx" ON "package_departures"("start_date");

-- CreateIndex
CREATE UNIQUE INDEX "package_departures_package_id_start_date_key" ON "package_departures"("package_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "package_extras_package_id_code_key" ON "package_extras"("package_id", "code");

-- CreateIndex
CREATE INDEX "package_media_package_id_idx" ON "package_media"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "package_translations_package_id_locale_key" ON "package_translations"("package_id", "locale");

-- CreateIndex
CREATE INDEX "package_slug_redirects_package_id_idx" ON "package_slug_redirects"("package_id");

-- CreateIndex
CREATE INDEX "package_services_tier_id_idx" ON "package_services"("tier_id");

-- CreateIndex
CREATE INDEX "packages_status_idx" ON "packages"("status");

-- AddForeignKey
ALTER TABLE "package_services" ADD CONSTRAINT "package_services_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "package_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_days" ADD CONSTRAINT "package_days_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_tiers" ADD CONSTRAINT "package_tiers_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_departures" ADD CONSTRAINT "package_departures_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_extras" ADD CONSTRAINT "package_extras_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_extras" ADD CONSTRAINT "package_extras_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_media" ADD CONSTRAINT "package_media_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_translations" ADD CONSTRAINT "package_translations_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_slug_redirects" ADD CONSTRAINT "package_slug_redirects_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

