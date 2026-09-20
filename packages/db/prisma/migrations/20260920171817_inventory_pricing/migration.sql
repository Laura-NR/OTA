-- CreateEnum
CREATE TYPE "InventoryType" AS ENUM ('ACCOMMODATION', 'TRANSPORT', 'EXPERIENCE');

-- CreateEnum
CREATE TYPE "PricingRuleKind" AS ENUM ('SEASONAL_RATE', 'MARKUP');

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "type" "InventoryType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "province" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "base_price" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "attributes" JSONB,
    "supplier_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL,
    "inventory_item_id" UUID,
    "kind" "PricingRuleKind" NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "amount" DECIMAL(10,2),
    "percent" DECIMAL(5,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_type_idx" ON "inventory_items"("type");

-- CreateIndex
CREATE INDEX "inventory_items_province_idx" ON "inventory_items"("province");

-- CreateIndex
CREATE INDEX "inventory_items_active_idx" ON "inventory_items"("active");

-- CreateIndex
CREATE INDEX "pricing_rules_inventory_item_id_idx" ON "pricing_rules"("inventory_item_id");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
