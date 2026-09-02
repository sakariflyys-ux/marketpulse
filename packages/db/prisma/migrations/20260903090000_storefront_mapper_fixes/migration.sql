-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "pageTitle" TEXT,
ADD COLUMN     "productCountTruncated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rawTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "TrackedEntity" ADD COLUMN     "blockedReason" TEXT,
ADD COLUMN     "blockedUntil" TIMESTAMP(3),
ADD COLUMN     "failCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inactiveReason" TEXT;

