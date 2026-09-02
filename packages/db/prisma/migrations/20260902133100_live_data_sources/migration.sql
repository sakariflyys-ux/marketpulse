-- CreateEnum
CREATE TYPE "TrackedKind" AS ENUM ('STORE', 'BRAND');

-- CreateEnum
CREATE TYPE "IngestSource" AS ENUM ('META_AD_LIBRARY', 'SHOPIFY_STOREFRONT');

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- AlterTable
ALTER TABLE "Ad" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "adLibraryId" TEXT,
ADD COLUMN     "euTotalReach" INTEGER,
ADD COLUMN     "firstSeenAt" TIMESTAMP(3),
ADD COLUMN     "impressionsLower" INTEGER,
ADD COLUMN     "impressionsUpper" INTEGER,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "pageId" TEXT,
ADD COLUMN     "pageName" TEXT,
ADD COLUMN     "raw" JSONB,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'mock',
ALTER COLUMN "spendEstimate" DROP NOT NULL,
ALTER COLUMN "impressions" DROP NOT NULL,
ALTER COLUMN "engagementRate" DROP NOT NULL,
ALTER COLUMN "storeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "estimateConfidence" TEXT,
ADD COLUMN     "priceMax" DOUBLE PRECISION,
ADD COLUMN     "priceMin" DOUBLE PRECISION,
ADD COLUMN     "productCount" INTEGER,
ADD COLUMN     "revenueEstimate" DOUBLE PRECISION,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'mock',
ADD COLUMN     "sourceUpdatedAt" TIMESTAMP(3),
ALTER COLUMN "monthlyRevenue" DROP NOT NULL,
ALTER COLUMN "monthlyTraffic" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StoreSnapshot" ADD COLUMN     "priceMax" DOUBLE PRECISION,
ADD COLUMN     "priceMin" DOUBLE PRECISION,
ADD COLUMN     "productCount" INTEGER,
ADD COLUMN     "revenueEstimate" DOUBLE PRECISION,
ADD COLUMN     "source" TEXT,
ALTER COLUMN "monthlyRevenue" DROP NOT NULL,
ALTER COLUMN "monthlyTraffic" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TrackedEntity" (
    "id" TEXT NOT NULL,
    "kind" "TrackedKind" NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "linkedDomain" TEXT,
    "addedByUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestRun" (
    "id" TEXT NOT NULL,
    "source" "IngestSource" NOT NULL,
    "status" "IngestStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsSeen" INTEGER NOT NULL DEFAULT 0,
    "itemsWritten" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "details" JSONB,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackedEntity_active_idx" ON "TrackedEntity"("active");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedEntity_kind_value_key" ON "TrackedEntity"("kind", "value");

-- CreateIndex
CREATE INDEX "IngestRun_source_startedAt_idx" ON "IngestRun"("source", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ad_adLibraryId_key" ON "Ad"("adLibraryId");

-- CreateIndex
CREATE INDEX "Ad_source_active_idx" ON "Ad"("source", "active");

-- CreateIndex
CREATE INDEX "Ad_lastSeenAt_idx" ON "Ad"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Ad_pageId_idx" ON "Ad"("pageId");

-- CreateIndex
CREATE INDEX "Store_source_idx" ON "Store"("source");

