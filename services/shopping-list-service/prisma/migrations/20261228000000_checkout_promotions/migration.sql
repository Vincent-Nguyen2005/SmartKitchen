-- Automatic checkout promotions (Quản trị › Chương trình khuyến mãi). Additive; existing orders keep their totals:
-- subtotal = total, no promotion, no discount.

-- CreateEnum
CREATE TYPE "PromotionScope" AS ENUM ('ORDER', 'GROUP', 'PRODUCTS');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT', 'AMOUNT');

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "subtotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "promotionId" UUID,
ADD COLUMN "promotionName" TEXT,
ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Purchase" SET "subtotal" = "total";

-- AlterTable
ALTER TABLE "ShoppingItem" ADD COLUMN "discountShare" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CheckoutPromotion" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "PromotionScope" NOT NULL,
    "groups" TEXT[],
    "productIds" TEXT[],
    "type" "PromotionType" NOT NULL,
    "value" INTEGER NOT NULL,
    "maxDiscount" INTEGER,
    "minSubtotal" INTEGER,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "usageLimitPerUser" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionAuditLog" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "promotionId" UUID NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Purchase_promotionId_buyerUserId_idx" ON "Purchase"("promotionId", "buyerUserId");

-- CreateIndex
CREATE INDEX "CheckoutPromotion_isActive_startDate_endDate_idx" ON "CheckoutPromotion"("isActive", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "PromotionAuditLog_promotionId_createdAt_idx" ON "PromotionAuditLog"("promotionId", "createdAt");
