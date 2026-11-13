-- AlterTable
ALTER TABLE "session" ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "ownDevice" BOOLEAN NOT NULL DEFAULT false;
