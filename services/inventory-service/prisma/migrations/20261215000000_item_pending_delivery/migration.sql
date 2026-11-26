-- Kho rows of an Đi chợ order that is not delivered yet ("Đang giao"). Additive.
ALTER TABLE "FoodItem" ADD COLUMN "deliveryOrderId" UUID,
ADD COLUMN "pendingPurchaseId" UUID;

CREATE UNIQUE INDEX "FoodItem_pendingPurchaseId_key" ON "FoodItem"("pendingPurchaseId");
CREATE INDEX "FoodItem_deliveryOrderId_idx" ON "FoodItem"("deliveryOrderId");
