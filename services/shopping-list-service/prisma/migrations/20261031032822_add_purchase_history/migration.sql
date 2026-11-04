-- CreateTable
CREATE TABLE "PurchaseHistory" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "itemKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shoppingItemId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseHistory_shoppingItemId_key" ON "PurchaseHistory"("shoppingItemId");

-- CreateIndex
CREATE INDEX "PurchaseHistory_familyId_itemKey_purchasedAt_idx" ON "PurchaseHistory"("familyId", "itemKey", "purchasedAt");
