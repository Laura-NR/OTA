-- CreateTable
CREATE TABLE "inventory_media" (
    "id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "alt_text" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_media_inventory_item_id_idx" ON "inventory_media"("inventory_item_id");

-- AddForeignKey
ALTER TABLE "inventory_media" ADD CONSTRAINT "inventory_media_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
