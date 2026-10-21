-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('GRAM', 'KILOGRAM', 'MILLILITER', 'LITER', 'PIECE', 'PACK', 'BOTTLE', 'CAN', 'BOX');

-- CreateEnum
CREATE TYPE "StorageLocation" AS ENUM ('FRIDGE', 'FREEZER', 'PANTRY', 'COUNTER');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('FRESH', 'NEAR_EXPIRY', 'EXPIRED', 'CONSUMED', 'DISCARDED');

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodItem" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" "Unit" NOT NULL DEFAULT 'PIECE',
    "minQuantity" DOUBLE PRECISION,
    "categoryId" UUID,
    "storageLocation" "StorageLocation" NOT NULL DEFAULT 'FRIDGE',
    "expiryDate" TIMESTAMP(3),
    "status" "ItemStatus" NOT NULL DEFAULT 'FRESH',
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLog" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "note" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "FoodItem_familyId_idx" ON "FoodItem"("familyId");

-- CreateIndex
CREATE INDEX "FoodItem_expiryDate_idx" ON "FoodItem"("expiryDate");

-- CreateIndex
CREATE INDEX "FoodItem_status_idx" ON "FoodItem"("status");

-- CreateIndex
CREATE INDEX "InventoryLog_itemId_idx" ON "InventoryLog"("itemId");

-- AddForeignKey
ALTER TABLE "FoodItem" ADD CONSTRAINT "FoodItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
