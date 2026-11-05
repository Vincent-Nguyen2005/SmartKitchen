ALTER TABLE "FoodItem" ADD COLUMN "barcode" VARCHAR(32);
ALTER TABLE "InventoryLog" ADD COLUMN "externalRef" UUID;

CREATE UNIQUE INDEX "InventoryLog_externalRef_key" ON "InventoryLog"("externalRef");
CREATE INDEX "FoodItem_familyId_barcode_idx" ON "FoodItem"("familyId", "barcode");
