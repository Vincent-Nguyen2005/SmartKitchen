-- Đi chợ checkout becomes a delivery order paid by cash on delivery. Additive; existing purchases (already in Kho)
-- become DELIVERED at their purchase time.

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'SHIPPING', 'DELIVERED', 'CANCELLED', 'FAILED');

-- AlterTable: existing rows take DELIVERED, new rows default to PENDING.
ALTER TABLE "Purchase" ADD COLUMN "status" "OrderStatus" NOT NULL DEFAULT 'DELIVERED',
ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'COD',
ADD COLUMN "codAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "deliveryAddress" TEXT,
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "receiverName" TEXT,
ADD COLUMN "receiverPhone" TEXT,
ADD COLUMN "note" TEXT,
ADD COLUMN "shipperId" UUID,
ADD COLUMN "shippingAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "failReason" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Purchase" SET "deliveredAt" = "purchasedAt", "codAmount" = "total" WHERE "deliveredAt" IS NULL;

ALTER TABLE "Purchase" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "ShoppingItem" ADD COLUMN "shelfLifeDays" INTEGER;

-- CreateIndex
CREATE INDEX "Purchase_familyId_deliveredAt_idx" ON "Purchase"("familyId", "deliveredAt");
CREATE INDEX "Purchase_status_purchasedAt_idx" ON "Purchase"("status", "purchasedAt");
CREATE INDEX "Purchase_shipperId_idx" ON "Purchase"("shipperId");
