-- AlterTable
ALTER TABLE "Menu" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "servings" INTEGER;

-- AlterTable
ALTER TABLE "RemovedDish" ADD COLUMN     "familyId" TEXT;

-- CreateTable
CREATE TABLE "FamilyMenuSettings" (
    "familyId" TEXT NOT NULL,
    "breakfast" INTEGER NOT NULL DEFAULT 3,
    "lunch" INTEGER NOT NULL DEFAULT 5,
    "dinner" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyMenuSettings_pkey" PRIMARY KEY ("familyId")
);

-- CreateIndex
CREATE INDEX "RemovedDish_familyId_removedAt_idx" ON "RemovedDish"("familyId", "removedAt");


-- Family menus: before the partial unique index, archive older duplicates among menus that already carry a
-- familyId (menus stored the family whose Kho they used). Per family, day and period the most recently updated
-- menu stays active; the others stay readable as history (archived = true). Nothing is deleted.
UPDATE "Menu" AS m
SET "archived" = true
FROM (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "familyId", "startDate", "periodType"
        ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
    FROM "Menu"
    WHERE "familyId" IS NOT NULL AND "archived" = false
) AS ranked
WHERE m."id" = ranked."id" AND ranked.rn > 1;

-- One active menu per family, day and period (Prisma cannot declare a partial index; see schema.prisma).
CREATE UNIQUE INDEX "Menu_family_period_active_key" ON "Menu"("familyId", "startDate", "periodType")
WHERE "familyId" IS NOT NULL AND "archived" = false;
