CREATE TABLE "PurchaseApplication" (
    "externalPurchaseId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseApplication_pkey" PRIMARY KEY ("externalPurchaseId")
);

CREATE INDEX "PurchaseApplication_familyId_createdAt_idx"
ON "PurchaseApplication"("familyId", "createdAt");
