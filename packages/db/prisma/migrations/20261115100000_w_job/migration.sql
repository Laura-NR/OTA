-- CreateEnum
CREATE TYPE "IncidentSource" AS ENUM ('DESK', 'WORKER_APP', 'WORKER_SMS');

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "acknowledged_at" TIMESTAMP(3),
ADD COLUMN     "acknowledged_by_id" UUID,
ADD COLUMN     "client_ref" TEXT,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "location_accuracy_m" INTEGER,
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "occurred_at" TIMESTAMP(3),
ADD COLUMN     "service_item_id" UUID,
ADD COLUMN     "source" "IncidentSource" NOT NULL DEFAULT 'DESK',
ADD COLUMN     "supplier_id" UUID;

-- AlterTable
ALTER TABLE "service_items" ADD COLUMN     "arrived_at" TIMESTAMP(3),
ADD COLUMN     "drop_off" TEXT,
ADD COLUMN     "en_route_at" TIMESTAMP(3),
ADD COLUMN     "finished_at" TIMESTAMP(3),
ADD COLUMN     "meeting_point" TEXT,
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "worker_brief" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "incidents_client_ref_key" ON "incidents"("client_ref");

-- CreateIndex
CREATE INDEX "incidents_service_item_id_idx" ON "incidents"("service_item_id");

-- CreateIndex
CREATE INDEX "incidents_acknowledged_at_idx" ON "incidents"("acknowledged_at");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

