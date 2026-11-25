-- CreateTable
CREATE TABLE "FamilyQrToken" (
    "familyId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyQrToken_pkey" PRIMARY KEY ("familyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FamilyQrToken_tokenHash_key" ON "FamilyQrToken"("tokenHash");

-- CreateIndex
CREATE INDEX "FamilyQrToken_expiresAt_idx" ON "FamilyQrToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "FamilyQrToken" ADD CONSTRAINT "FamilyQrToken_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "FamilyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

