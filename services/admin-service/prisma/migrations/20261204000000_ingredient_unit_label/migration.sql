-- AlterTable: specific word for one piece-type sale unit ("quả", "bìa"...); null = the unit's own word.
ALTER TABLE "master_ingredients" ADD COLUMN     "unitLabel" TEXT;
