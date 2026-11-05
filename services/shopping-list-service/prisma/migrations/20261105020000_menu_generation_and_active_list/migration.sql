ALTER TABLE "ShoppingList" ADD COLUMN "activeFamilyId" UUID;
ALTER TABLE "ShoppingItem"
  ADD COLUMN "generatedKey" TEXT,
  ADD COLUMN "sourceMenuId" UUID;

-- Consolidate older active lists into the most recently updated active list for each family.
WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (PARTITION BY "familyId" ORDER BY "updatedAt" DESC, "id" DESC) AS "canonicalId",
    ROW_NUMBER() OVER (PARTITION BY "familyId" ORDER BY "updatedAt" DESC, "id" DESC) AS "rank"
  FROM "ShoppingList"
  WHERE "status" = 'ACTIVE'
)
UPDATE "ShoppingItem" AS item
SET "shoppingListId" = ranked."canonicalId"
FROM ranked
WHERE item."shoppingListId" = ranked."id"
  AND ranked."rank" > 1;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "familyId" ORDER BY "updatedAt" DESC, "id" DESC) AS "rank"
  FROM "ShoppingList"
  WHERE "status" = 'ACTIVE'
)
DELETE FROM "ShoppingList" AS list
USING ranked
WHERE list."id" = ranked."id"
  AND ranked."rank" > 1;

UPDATE "ShoppingList"
SET "activeFamilyId" = "familyId"
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "ShoppingList_activeFamilyId_key"
  ON "ShoppingList"("activeFamilyId");
CREATE UNIQUE INDEX "ShoppingItem_shoppingListId_generatedKey_key"
  ON "ShoppingItem"("shoppingListId", "generatedKey");
