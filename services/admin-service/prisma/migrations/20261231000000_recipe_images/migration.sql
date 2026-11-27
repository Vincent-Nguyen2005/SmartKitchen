-- Dish images uploaded by admins (Quản trị › Chụp ảnh / dish form). Additive.

-- CreateTable
CREATE TABLE "recipe_images" (
    "fileName" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_images_pkey" PRIMARY KEY ("fileName")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipe_images_recipeId_key" ON "recipe_images"("recipeId");
