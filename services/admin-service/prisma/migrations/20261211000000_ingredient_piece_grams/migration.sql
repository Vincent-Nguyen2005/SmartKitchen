-- AlterTable: typical weight in grams of ONE piece (quả / củ / cây / lát) for products sold by weight or in packs, so
-- recipe amounts counted in pieces convert to the sale unit ("Cần mua tuần này"); null = unknown.
ALTER TABLE "master_ingredients" ADD COLUMN     "pieceGrams" INTEGER;
