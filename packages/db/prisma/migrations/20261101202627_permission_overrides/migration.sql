-- CreateEnum
CREATE TYPE "PermissionOverrideState" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED', 'ENDED');

-- CreateTable
CREATE TABLE "permission_overrides" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "state" "PermissionOverrideState" NOT NULL DEFAULT 'REQUESTED',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "expires_at" TIMESTAMP(3),
    "ended_by_id" UUID,
    "ended_at" TIMESTAMP(3),
    "end_note" TEXT,

    CONSTRAINT "permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permission_overrides_user_id_capability_state_idx" ON "permission_overrides"("user_id", "capability", "state");

-- AddForeignKey
ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_ended_by_id_fkey" FOREIGN KEY ("ended_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
