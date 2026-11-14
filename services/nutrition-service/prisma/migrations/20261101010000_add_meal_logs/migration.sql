CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');
CREATE TYPE "MealSource" AS ENUM ('HOME', 'EATING_OUT', 'DELIVERY');

CREATE TABLE "MealLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "mealType" "MealType" NOT NULL,
    "source" "MealSource" NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MealLogItem" (
    "id" UUID NOT NULL,
    "mealLogId" UUID NOT NULL,
    "foodName" TEXT NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MealLogItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MealLog_userId_loggedAt_idx" ON "MealLog"("userId", "loggedAt");
CREATE INDEX "MealLogItem_mealLogId_idx" ON "MealLogItem"("mealLogId");

ALTER TABLE "MealLogItem"
    ADD CONSTRAINT "MealLogItem_mealLogId_fkey"
    FOREIGN KEY ("mealLogId") REFERENCES "MealLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;