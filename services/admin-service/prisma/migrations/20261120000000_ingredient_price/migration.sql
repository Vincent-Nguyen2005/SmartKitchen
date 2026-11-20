-- Optional ingredient price in whole VND for the user market (Đi chợ). Null = no price.
ALTER TABLE "master_ingredients" ADD COLUMN "price" INTEGER;

ALTER TABLE "master_ingredients" ADD CONSTRAINT "master_ingredients_price_nonnegative" CHECK ("price" IS NULL OR "price" >= 0);
