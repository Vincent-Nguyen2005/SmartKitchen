-- CreateEnum
CREATE TYPE "ItemOrigin" AS ENUM ('MANUAL', 'PURCHASE');

-- AlterTable
ALTER TABLE "FoodItem" ADD COLUMN     "origin" "ItemOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "purchasedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CookApplication" (
    "cookId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CookApplication_pkey" PRIMARY KEY ("cookId")
);

-- CreateIndex
CREATE INDEX "CookApplication_familyId_createdAt_idx" ON "CookApplication"("familyId", "createdAt");

-- Backfill: rows a Đi chợ purchase created (PURCHASE_ADD log) are PURCHASE rows; purchasedAt = their latest
-- purchase (creation or restock). Manual rows that only received a purchase merge stay MANUAL.
UPDATE "FoodItem" AS item
SET "origin" = 'PURCHASE',
    "purchasedAt" = (SELECT MAX(log."createdAt") FROM "InventoryLog" AS log
                     WHERE log."itemId" = item."id" AND log."action" IN ('PURCHASE_ADD', 'PURCHASE_RESTOCK'))
WHERE EXISTS (SELECT 1 FROM "InventoryLog" AS log WHERE log."itemId" = item."id" AND log."action" = 'PURCHASE_ADD');
