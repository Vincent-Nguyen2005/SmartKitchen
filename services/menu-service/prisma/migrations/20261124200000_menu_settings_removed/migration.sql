-- CreateTable
CREATE TABLE "MenuSettings" (
    "userId" TEXT NOT NULL,
    "breakfast" INTEGER NOT NULL DEFAULT 3,
    "lunch" INTEGER NOT NULL DEFAULT 5,
    "dinner" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RemovedDish" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT,
    "dishName" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemovedDish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RemovedDish_userId_removedAt_idx" ON "RemovedDish"("userId", "removedAt");

