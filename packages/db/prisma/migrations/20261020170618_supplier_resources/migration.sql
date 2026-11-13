-- CreateEnum
CREATE TYPE "GeneratorAccess" AS ENUM ('NONE', 'OWN', 'SHARED');

-- CreateEnum
CREATE TYPE "ResourceChannel" AS ENUM ('PHONE', 'WHATSAPP', 'VISIT', 'WORKER_APP');

-- CreateTable
CREATE TABLE "supplier_resources" (
    "supplier_id" UUID NOT NULL,
    "generator" "GeneratorAccess",
    "generator_hours_per_day" SMALLINT,
    "generator_schedule" VARCHAR(60),
    "generator_fuel_days" SMALLINT,
    "solar_battery_kwh" DECIMAL(5,1),
    "water_tank_litres" INTEGER,
    "rooms" SMALLINT,
    "guest_capacity" SMALLINT,
    "fuel_reserve_litres" INTEGER,
    "confirmed_at" TIMESTAMP(3) NOT NULL,
    "confirmed_by_id" UUID,
    "confirmed_via" "ResourceChannel" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_resources_pkey" PRIMARY KEY ("supplier_id")
);

-- CreateIndex
CREATE INDEX "supplier_resources_confirmed_at_idx" ON "supplier_resources"("confirmed_at");

-- AddForeignKey
ALTER TABLE "supplier_resources" ADD CONSTRAINT "supplier_resources_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_resources" ADD CONSTRAINT "supplier_resources_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- M6 backstops (Prisma cannot express them); the API validates the same bounds first.
ALTER TABLE "supplier_resources" ADD CONSTRAINT "supplier_resources_generator_hours_check"
  CHECK ("generator_hours_per_day" BETWEEN 0 AND 24);
ALTER TABLE "supplier_resources" ADD CONSTRAINT "supplier_resources_amounts_check"
  CHECK (
    "generator_fuel_days" >= 0
    AND "solar_battery_kwh" >= 0
    AND "water_tank_litres" >= 0
    AND "rooms" >= 0
    AND "guest_capacity" >= 0
    AND "fuel_reserve_litres" >= 0
  );
