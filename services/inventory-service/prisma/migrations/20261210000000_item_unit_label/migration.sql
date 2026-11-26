-- Kho: the specific word for a piece-type unit ("quả", "trái", "bìa", "nải"); null = the unit's own word ("cái").
ALTER TABLE "FoodItem" ADD COLUMN "unitLabel" VARCHAR(16);
