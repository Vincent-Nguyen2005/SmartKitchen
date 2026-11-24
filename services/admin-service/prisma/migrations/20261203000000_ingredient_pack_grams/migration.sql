-- AlterTable: weight in grams of one PACK / PIECE sale unit (recipe grams <-> packs).
ALTER TABLE "master_ingredients" ADD COLUMN     "packGrams" INTEGER;
