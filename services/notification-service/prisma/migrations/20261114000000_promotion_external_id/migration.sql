-- Promotions synced from admin-service ingredients are identified by a stable external id.
ALTER TABLE "promotions" ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "promotions_externalId_key" ON "promotions"("externalId");
