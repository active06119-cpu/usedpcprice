-- AlterTable
ALTER TABLE "market_listings" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "market_listings" ADD COLUMN IF NOT EXISTS "verdict" TEXT;
