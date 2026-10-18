-- CreateEnum
CREATE TYPE "AdvisorySeverity" AS ENUM ('INFO', 'CAUTION', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AdvisoryStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'LIFTED');

-- CreateTable
CREATE TABLE "advisories" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "severity" "AdvisorySeverity" NOT NULL,
    "status" "AdvisoryStatus" NOT NULL DEFAULT 'DRAFT',
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "effective_from" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "source_locale" TEXT NOT NULL DEFAULT 'en',
    "show_on_site" BOOLEAN NOT NULL DEFAULT true,
    "show_on_packages" BOOLEAN NOT NULL DEFAULT true,
    "notify_travelers" BOOLEAN NOT NULL DEFAULT true,
    "supersedes_id" UUID,
    "created_by_id" UUID,
    "published_at" TIMESTAMP(3),
    "lifted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advisories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisory_translations" (
    "id" UUID NOT NULL,
    "advisory_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advisory_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisory_approvals" (
    "id" UUID NOT NULL,
    "advisory_id" UUID NOT NULL,
    "approver_id" UUID,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advisory_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisory_acknowledgements" (
    "id" UUID NOT NULL,
    "advisory_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advisory_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "advisories_reference_key" ON "advisories"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "advisories_supersedes_id_key" ON "advisories"("supersedes_id");

-- CreateIndex
CREATE INDEX "advisories_status_expires_at_idx" ON "advisories"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "advisory_translations_advisory_id_locale_key" ON "advisory_translations"("advisory_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "advisory_approvals_advisory_id_approver_id_key" ON "advisory_approvals"("advisory_id", "approver_id");

-- CreateIndex
CREATE UNIQUE INDEX "advisory_acknowledgements_advisory_id_user_id_key" ON "advisory_acknowledgements"("advisory_id", "user_id");

-- AddForeignKey
ALTER TABLE "advisories" ADD CONSTRAINT "advisories_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "advisories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advisories" ADD CONSTRAINT "advisories_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advisory_translations" ADD CONSTRAINT "advisory_translations_advisory_id_fkey" FOREIGN KEY ("advisory_id") REFERENCES "advisories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advisory_approvals" ADD CONSTRAINT "advisory_approvals_advisory_id_fkey" FOREIGN KEY ("advisory_id") REFERENCES "advisories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advisory_approvals" ADD CONSTRAINT "advisory_approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advisory_acknowledgements" ADD CONSTRAINT "advisory_acknowledgements_advisory_id_fkey" FOREIGN KEY ("advisory_id") REFERENCES "advisories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advisory_acknowledgements" ADD CONSTRAINT "advisory_acknowledgements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
