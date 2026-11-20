-- Price snapshot for market items (Giỏ hàng totals). All nullable: older items and manual items have none.
ALTER TABLE "ShoppingItem" ADD COLUMN "unitPrice" INTEGER;
ALTER TABLE "ShoppingItem" ADD COLUMN "discountPercent" INTEGER;
ALTER TABLE "ShoppingItem" ADD COLUMN "productId" TEXT;
ALTER TABLE "ShoppingItem" ADD COLUMN "imageUrl" TEXT;

ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_unitPrice_nonnegative" CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0);
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_discountPercent_range" CHECK ("discountPercent" IS NULL OR ("discountPercent" BETWEEN 1 AND 100));
