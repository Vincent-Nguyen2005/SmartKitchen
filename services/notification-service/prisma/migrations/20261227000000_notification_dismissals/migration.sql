-- CreateTable: per-user dismissed Thông báo items (computed items and promotions), keyed with their state.
CREATE TABLE "notification_dismissals" (
    "userId" TEXT NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_dismissals_pkey" PRIMARY KEY ("userId","key")
);

-- CreateIndex
CREATE INDEX "notification_dismissals_createdAt_idx" ON "notification_dismissals"("createdAt");
