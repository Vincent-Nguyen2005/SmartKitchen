CREATE TABLE "FamilySettings" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "defaultDietaryRestrictions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "monthlyBudget" DECIMAL(10,2),
    "householdRules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilySettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FamilySettings_familyId_key" ON "FamilySettings"("familyId");

ALTER TABLE "FamilySettings"
ADD CONSTRAINT "FamilySettings_familyId_fkey"
FOREIGN KEY ("familyId") REFERENCES "FamilyGroup"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
