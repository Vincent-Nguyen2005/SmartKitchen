-- CreateTable
CREATE TABLE "deleted_starter_recipes" (
    "nameKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deleted_starter_recipes_pkey" PRIMARY KEY ("nameKey")
);

