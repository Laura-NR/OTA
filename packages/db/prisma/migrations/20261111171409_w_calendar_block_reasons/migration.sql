-- CreateEnum
CREATE TYPE "AvailabilityBlockReason" AS ENUM ('FAMILY', 'VEHICLE_REPAIR', 'OTHER_JOB', 'OTHER');

-- AlterTable
ALTER TABLE "availabilities" ADD COLUMN     "block_reason" "AvailabilityBlockReason";
