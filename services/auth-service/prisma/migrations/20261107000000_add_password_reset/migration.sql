ALTER TABLE "User"
  ADD COLUMN "resetCodeHash" TEXT,
  ADD COLUMN "resetExpiresAt" TIMESTAMP(3),
  ADD COLUMN "resetRequestedAt" TIMESTAMP(3),
  ADD COLUMN "resetAttempts" INTEGER NOT NULL DEFAULT 0;
