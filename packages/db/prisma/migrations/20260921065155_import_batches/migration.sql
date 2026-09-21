-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('STAGED', 'COMMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "created_by_user_id" UUID,
    "filename" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'STAGED',
    "columns" TEXT[],
    "row_count" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,
    "mapping" JSONB,
    "imported_count" INTEGER,
    "errors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_status_idx" ON "import_batches"("status");
