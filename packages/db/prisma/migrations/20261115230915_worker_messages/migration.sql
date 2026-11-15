-- CreateEnum
CREATE TYPE "WorkerMessageSender" AS ENUM ('WORKER', 'OPERATIONS');

-- CreateTable
CREATE TABLE "worker_messages" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "sender" "WorkerMessageSender" NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" UUID,
    "service_item_id" UUID,
    "written_at" TIMESTAMP(3),
    "client_ref" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worker_messages_client_ref_key" ON "worker_messages"("client_ref");

-- CreateIndex
CREATE INDEX "worker_messages_supplier_id_created_at_idx" ON "worker_messages"("supplier_id", "created_at");

-- CreateIndex
CREATE INDEX "worker_messages_service_item_id_idx" ON "worker_messages"("service_item_id");

-- AddForeignKey
ALTER TABLE "worker_messages" ADD CONSTRAINT "worker_messages_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_messages" ADD CONSTRAINT "worker_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_messages" ADD CONSTRAINT "worker_messages_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
