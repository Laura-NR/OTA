-- CreateEnum
CREATE TYPE "SupplierApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "supplier_applications" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "category" "SupplierCategory" NOT NULL,
    "provinces_active" TEXT[],
    "rtn_license_number" TEXT NOT NULL,
    "message" TEXT,
    "status" "SupplierApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_applications_status_idx" ON "supplier_applications"("status");

-- CreateIndex
CREATE INDEX "supplier_applications_email_idx" ON "supplier_applications"("email");
