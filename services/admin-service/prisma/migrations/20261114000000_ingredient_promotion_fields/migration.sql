-- Optional image link and discount for master ingredients; a discount publishes a user promotion.
ALTER TABLE "master_ingredients" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "master_ingredients" ADD COLUMN "discountPercent" INTEGER;
ALTER TABLE "master_ingredients" ADD COLUMN "promoEndDate" DATE;

ALTER TABLE "master_ingredients" ADD CONSTRAINT "master_ingredients_discountPercent_range" CHECK ("discountPercent" IS NULL OR ("discountPercent" BETWEEN 1 AND 100));
