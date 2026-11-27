-- Automatic daily discounts (Quản trị › Giảm giá tự động). Additive.

-- CreateTable
CREATE TABLE "daily_deal_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dealsPerDay" INTEGER NOT NULL DEFAULT 10,
    "minPercent" INTEGER NOT NULL DEFAULT 5,
    "maxPercent" INTEGER NOT NULL DEFAULT 20,
    "excludedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_deal_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_deals" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "productId" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_deal_days" (
    "day" DATE NOT NULL,
    "rerolls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_deal_days_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_deals_day_productId_key" ON "daily_deals"("day", "productId");

-- CreateIndex
CREATE INDEX "daily_deals_day_idx" ON "daily_deals"("day");
