-- CreateEnum
CREATE TYPE "TourismCategory" AS ENUM ('ECOTOURISM', 'AGROTOURISM', 'NATURE', 'CULTURAL', 'GENERAL');

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "tourism_category" "TourismCategory" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nationality" TEXT;
