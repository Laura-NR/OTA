-- AlterTable
ALTER TABLE "event_translations" ADD COLUMN     "hold_note" TEXT,
ADD COLUMN     "media_alt" JSONB;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "hold_inventory_item_id" UUID,
ADD COLUMN     "hold_note" TEXT,
ADD COLUMN     "hold_until" DATE;

-- CreateTable
CREATE TABLE "event_media" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "alt_text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "shows_people" BOOLEAN NOT NULL DEFAULT false,
    "consent_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_media_event_id_idx" ON "event_media"("event_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_hold_inventory_item_id_fkey" FOREIGN KEY ("hold_inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
