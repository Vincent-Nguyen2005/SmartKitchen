-- AlterTable
ALTER TABLE "master_ingredients" ADD COLUMN     "promoStartDate" DATE;


-- Backfill (no far-future dates): discounts saved before start dates existed were already running, so they start
-- today (Vietnam calendar day), never after their last day; a discount without a last day ends 7 days after that.
UPDATE "master_ingredients"
SET "promoStartDate" = LEAST(COALESCE("promoEndDate", (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
WHERE "discountPercent" IS NOT NULL AND "promoStartDate" IS NULL;
UPDATE "master_ingredients"
SET "promoEndDate" = "promoStartDate" + 7
WHERE "discountPercent" IS NOT NULL AND "promoEndDate" IS NULL;
