-- AlterTable
ALTER TABLE "Menu" ADD COLUMN     "healthUnavailable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FamilyHealthContext" (
    "key" TEXT NOT NULL,
    "members" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyHealthContext_pkey" PRIMARY KEY ("key")
);

