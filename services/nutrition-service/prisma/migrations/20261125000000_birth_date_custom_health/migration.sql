-- AlterTable
ALTER TABLE "NutritionProfile" ADD COLUMN     "birthDate" DATE;

-- CreateTable
CREATE TABLE "UserHealthCustom" (
    "userId" UUID NOT NULL,
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserHealthCustom_pkey" PRIMARY KEY ("userId")
);

