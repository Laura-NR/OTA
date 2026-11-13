-- CreateEnum
CREATE TYPE "SettingsVersionStatus" AS ENUM ('PROPOSED', 'APPLIED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deactivated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "operating_settings" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SettingsVersionStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposed_by_id" UUID,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operating_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_invites" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operating_settings_version_key" ON "operating_settings"("version");

-- CreateIndex
CREATE INDEX "operating_settings_status_version_idx" ON "operating_settings"("status", "version");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_token_hash_key" ON "staff_invites"("token_hash");

-- CreateIndex
CREATE INDEX "staff_invites_email_idx" ON "staff_invites"("email");

-- AddForeignKey
ALTER TABLE "operating_settings" ADD CONSTRAINT "operating_settings_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_settings" ADD CONSTRAINT "operating_settings_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- M9 backstops (Prisma cannot express them); the API checks the same first.
-- At most one proposal waits for its second Super Admin (D3).
CREATE UNIQUE INDEX "operating_settings_one_proposed" ON "operating_settings" ("status")
  WHERE "status" = 'PROPOSED';
-- A decided version records when; a pending one has no decision yet. The
-- decider may later be set null when that user is deleted.
ALTER TABLE "operating_settings" ADD CONSTRAINT "operating_settings_decided_check"
  CHECK (("status" = 'PROPOSED') = ("decided_at" IS NULL));
-- Invites are for staff roles only (D4).
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_staff_role_check"
  CHECK ("role" IN ('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'ADMINISTRATIVE_SUPPORT'));
-- A Super Admin invite is accepted only after a second Super Admin confirmed it.
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_super_admin_confirmed_check"
  CHECK ("role" <> 'SUPER_ADMIN' OR "accepted_at" IS NULL OR "confirmed_at" IS NOT NULL);
