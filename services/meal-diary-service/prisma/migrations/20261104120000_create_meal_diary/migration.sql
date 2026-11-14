CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');
CREATE TYPE "MealSource" AS ENUM ('HOME', 'EATING_OUT', 'DELIVERY');

CREATE TABLE "MealDiary" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "mealType" "MealType" NOT NULL,
    "source" "MealSource" NOT NULL DEFAULT 'HOME',
    "date" DATE NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealDiary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MealDiaryItem" (
    "id" UUID NOT NULL,
    "mealDiaryId" UUID NOT NULL,
    "foodName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'serving',
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealDiaryItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MealDiary_userId_date_idx" ON "MealDiary"("userId", "date");
CREATE INDEX "MealDiaryItem_mealDiaryId_idx" ON "MealDiaryItem"("mealDiaryId");

ALTER TABLE "MealDiaryItem"
    ADD CONSTRAINT "MealDiaryItem_mealDiaryId_fkey"
    FOREIGN KEY ("mealDiaryId") REFERENCES "MealDiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
