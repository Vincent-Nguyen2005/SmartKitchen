-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "calories" DOUBLE PRECISION,
ADD COLUMN     "carbs" DOUBLE PRECISION,
ADD COLUMN     "contraindications" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fat" DOUBLE PRECISION,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "ingredientDetails" JSONB,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "protein" DOUBLE PRECISION;

