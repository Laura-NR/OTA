-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "completed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "retention_notice_sent_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "reservations_completed_at_idx" ON "reservations"("completed_at");

-- Backfill completed_at for bookings that already reached COMPLETED, using the
-- latest transition audit row (spec §3.5). Existing bookings otherwise keep a
-- null anchor and would never enter the retention clock.
UPDATE "reservations" AS r
SET "completed_at" = latest.completed_at
FROM (
    SELECT "entity_id", MAX("created_at") AS completed_at
    FROM "audit_logs"
    WHERE "action" = 'reservation.transition'
      AND "metadata" ->> 'to' = 'COMPLETED'
    GROUP BY "entity_id"
) AS latest
WHERE r."id"::text = latest."entity_id"
  AND r."completed_at" IS NULL;
