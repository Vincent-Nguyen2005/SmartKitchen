CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

CREATE TYPE "ActivityLevel" AS ENUM (
    'SEDENTARY',
    'LIGHTLY_ACTIVE',
    'MODERATELY_ACTIVE',
    'ACTIVE',
    'VERY_ACTIVE'
);

CREATE TABLE "NutritionProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" "Gender" NOT NULL,
    "activityLevel" "ActivityLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NutritionProfile_userId_key" ON "NutritionProfile"("userId");