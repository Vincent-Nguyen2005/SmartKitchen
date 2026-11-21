-- CreateTable
CREATE TABLE "AiSuggestion" (
    "familyId" TEXT NOT NULL,
    "dishes" JSONB NOT NULL,
    "khoHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationDay" TEXT NOT NULL,
    "generationCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("familyId")
);

-- CreateTable
CREATE TABLE "SavedRecipe" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "name" TEXT NOT NULL,
    "dish" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedRecipe_familyId_idx" ON "SavedRecipe"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedRecipe_familyId_name_key" ON "SavedRecipe"("familyId", "name");

