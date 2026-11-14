-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('TRANSPORT_LICENCE', 'TECHNICAL_INSPECTION', 'LIABILITY_INSURANCE', 'GUIDE_LICENCE', 'HOST_LICENCE', 'IDENTITY_CARD');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('PENDING_AUDIT', 'VERIFIED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "supplier_credentials" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'PENDING_AUDIT',
    "storage_key" TEXT,
    "number" VARCHAR(60),
    "issuer" VARCHAR(120),
    "issued_on" DATE,
    "expires_on" DATE,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by_id" UUID,
    "uploaded_via" "ResourceChannel" NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "reject_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_credentials_supplier_id_kind_status_idx" ON "supplier_credentials"("supplier_id", "kind", "status");

-- CreateIndex
CREATE INDEX "supplier_credentials_status_idx" ON "supplier_credentials"("status");

-- AddForeignKey
ALTER TABLE "supplier_credentials" ADD CONSTRAINT "supplier_credentials_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credentials" ADD CONSTRAINT "supplier_credentials_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credentials" ADD CONSTRAINT "supplier_credentials_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (docs/schema-w-credentials.md V8): each existing credential file becomes one row of
-- the category's main document, verified when the supplier is.
INSERT INTO "supplier_credentials" ("id", "supplier_id", "kind", "status", "storage_key",
  "expires_on", "uploaded_at", "uploaded_via", "reviewed_at", "created_at", "updated_at")
SELECT gen_random_uuid(), sp."id",
  (CASE sp."category"
    WHEN 'PRIVATE_DRIVER' THEN 'TRANSPORT_LICENCE'
    WHEN 'TOUR_GUIDE' THEN 'GUIDE_LICENCE'
    WHEN 'HOMESTAY_HOST' THEN 'HOST_LICENCE'
    ELSE 'IDENTITY_CARD' END)::"CredentialKind",
  (CASE sp."verification_status"
    WHEN 'VERIFIED' THEN 'VERIFIED'
    ELSE 'PENDING_AUDIT' END)::"CredentialStatus",
  sp."credential_document_url", sp."credential_expires_at"::date,
  sp."updated_at", 'VISIT',
  CASE sp."verification_status" WHEN 'VERIFIED' THEN sp."updated_at" END,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "supplier_profiles" sp
WHERE sp."credential_document_url" IS NOT NULL;
