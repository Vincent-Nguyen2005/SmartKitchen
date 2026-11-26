-- CreateTable: one row per user and Vietnam day once the 07:00 morning push was sent (idempotency).
CREATE TABLE "morning_pushes" (
    "userId" TEXT NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "morning_pushes_pkey" PRIMARY KEY ("userId","day")
);
