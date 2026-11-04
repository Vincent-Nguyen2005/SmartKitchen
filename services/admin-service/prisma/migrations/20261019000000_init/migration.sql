-- CreateEnum
CREATE TYPE "ServiceHealthStatus" AS ENUM ('UP', 'DOWN', 'DEGRADED');
CREATE TYPE "ReportCategory" AS ENUM ('ABUSE', 'SPAM', 'BUG', 'OTHER');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

CREATE TABLE "master_ingredients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultUnit" TEXT NOT NULL,
    "shelfLifeDays" INTEGER,
    "caloriesPer100g" DOUBLE PRECISION,
    "proteinPer100g" DOUBLE PRECISION,
    "carbsPer100g" DOUBLE PRECISION,
    "fatPer100g" DOUBLE PRECISION,
    "allergenTags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_ingredients_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "recommendation_weights" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recommendation_weights_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "recommendation_weight_history" (
    "id" TEXT NOT NULL,
    "weightId" TEXT NOT NULL,
    "oldValue" DOUBLE PRECISION NOT NULL,
    "newValue" DOUBLE PRECISION NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recommendation_weight_history_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "service_health_logs" (
    "id" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "status" "ServiceHealthStatus" NOT NULL,
    "responseTimeMs" INTEGER,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_health_logs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "account_reports" (
    "id" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reportedUserId" TEXT,
    "category" "ReportCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "account_reports_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "master_ingredients_name_key" ON "master_ingredients"("name");
CREATE INDEX "master_ingredients_nameNormalized_idx" ON "master_ingredients"("nameNormalized");
CREATE INDEX "master_ingredients_category_isActive_idx" ON "master_ingredients"("category", "isActive");
CREATE UNIQUE INDEX "recommendation_weights_key_key" ON "recommendation_weights"("key");
CREATE INDEX "recommendation_weight_history_weightId_changedAt_idx" ON "recommendation_weight_history"("weightId", "changedAt");
CREATE INDEX "service_health_logs_serviceName_checkedAt_idx" ON "service_health_logs"("serviceName", "checkedAt");
CREATE INDEX "account_reports_status_createdAt_idx" ON "account_reports"("status", "createdAt");
CREATE INDEX "account_reports_reporterUserId_idx" ON "account_reports"("reporterUserId");
CREATE INDEX "account_reports_reportedUserId_idx" ON "account_reports"("reportedUserId");
CREATE INDEX "audit_logs_adminUserId_createdAt_idx" ON "audit_logs"("adminUserId", "createdAt");
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");
ALTER TABLE "recommendation_weight_history" ADD CONSTRAINT "recommendation_weight_history_weightId_fkey" FOREIGN KEY ("weightId") REFERENCES "recommendation_weights"("id") ON DELETE CASCADE ON UPDATE CASCADE;
