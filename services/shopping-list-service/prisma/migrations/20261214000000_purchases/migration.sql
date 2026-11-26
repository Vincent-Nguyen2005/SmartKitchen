-- "Chi tiêu": one Purchase per completed "Mua" plus per-line snapshots on ShoppingItem. Additive only.

-- CreateTable
CREATE TABLE "Purchase" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "buyerUserId" UUID,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" INTEGER NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ShoppingItem" ADD COLUMN "purchaseId" UUID,
ADD COLUMN "paidUnitPrice" INTEGER,
ADD COLUMN "lineTotal" INTEGER,
ADD COLUMN "groupName" TEXT,
ADD COLUMN "unitLabel" TEXT;

-- CreateIndex
CREATE INDEX "Purchase_familyId_purchasedAt_idx" ON "Purchase"("familyId", "purchasedAt");
CREATE INDEX "ShoppingItem_purchaseId_idx" ON "ShoppingItem"("purchaseId");

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: lines bought before this migration (in Kho, no purchase yet). Same rounding as the app's checkout:
-- paid unit price = round(unitPrice × (100 − discount%) / 100), line total = round(paid × quantity) (numeric, so
-- halves round up like Math.round for positive amounts). Lines bought in the same cart within the same minute form
-- one purchase; the buyer was not recorded then (NULL).
UPDATE "ShoppingItem"
SET "paidUnitPrice" = ROUND(("unitPrice"::numeric * (100 - COALESCE("discountPercent", 0))) / 100)::integer
WHERE "isPurchased" AND "inventoryAppliedAt" IS NOT NULL AND "purchaseId" IS NULL AND "unitPrice" IS NOT NULL;

UPDATE "ShoppingItem"
SET "lineTotal" = ROUND("paidUnitPrice"::numeric * "quantity"::numeric)::integer
WHERE "isPurchased" AND "inventoryAppliedAt" IS NOT NULL AND "purchaseId" IS NULL AND "paidUnitPrice" IS NOT NULL;

CREATE TEMP TABLE "_purchase_groups" AS
SELECT gen_random_uuid() AS "id", l."familyId", i."shoppingListId", date_trunc('minute', i."inventoryAppliedAt") AS "minute",
       MIN(i."inventoryAppliedAt") AS "purchasedAt", COUNT(*)::integer AS "itemCount", COALESCE(SUM(i."lineTotal"), 0)::integer AS "total"
FROM "ShoppingItem" i JOIN "ShoppingList" l ON l."id" = i."shoppingListId"
WHERE i."isPurchased" AND i."inventoryAppliedAt" IS NOT NULL AND i."purchaseId" IS NULL
GROUP BY l."familyId", i."shoppingListId", date_trunc('minute', i."inventoryAppliedAt");

INSERT INTO "Purchase" ("id", "familyId", "buyerUserId", "purchasedAt", "total", "itemCount")
SELECT "id", "familyId", NULL, "purchasedAt", "total", "itemCount" FROM "_purchase_groups";

UPDATE "ShoppingItem" i
SET "purchaseId" = g."id"
FROM "_purchase_groups" g
WHERE i."shoppingListId" = g."shoppingListId" AND date_trunc('minute', i."inventoryAppliedAt") = g."minute"
  AND i."isPurchased" AND i."purchaseId" IS NULL;

DROP TABLE "_purchase_groups";
