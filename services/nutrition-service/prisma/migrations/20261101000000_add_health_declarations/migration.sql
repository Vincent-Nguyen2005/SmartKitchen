CREATE TABLE "Allergy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allergy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthCondition" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthCondition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserAllergy" (
    "userId" UUID NOT NULL,
    "allergyId" UUID NOT NULL
);

CREATE TABLE "UserHealthCondition" (
    "userId" UUID NOT NULL,
    "conditionId" UUID NOT NULL
);

CREATE UNIQUE INDEX "Allergy_name_key" ON "Allergy"("name");
CREATE UNIQUE INDEX "HealthCondition_name_key" ON "HealthCondition"("name");
CREATE UNIQUE INDEX "UserAllergy_userId_allergyId_key" ON "UserAllergy"("userId", "allergyId");
CREATE UNIQUE INDEX "UserHealthCondition_userId_conditionId_key" ON "UserHealthCondition"("userId", "conditionId");

ALTER TABLE "UserAllergy"
    ADD CONSTRAINT "UserAllergy_allergyId_fkey"
    FOREIGN KEY ("allergyId") REFERENCES "Allergy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserHealthCondition"
    ADD CONSTRAINT "UserHealthCondition_conditionId_fkey"
    FOREIGN KEY ("conditionId") REFERENCES "HealthCondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;