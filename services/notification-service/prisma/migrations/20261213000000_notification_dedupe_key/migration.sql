-- AlterTable: optional unique key so a promotion feed row exists once per user ("promotion:<promotionId>:<userId>").
ALTER TABLE "notifications" ADD COLUMN "dedupeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");
