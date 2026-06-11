-- CreateEnum
CREATE TYPE "MarketSaleStatus" AS ENUM ('ACTIVE', 'SOLD', 'RESERVED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "parts_price" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "listedAt" TIMESTAMP(3),
    "saleStatus" "MarketSaleStatus" NOT NULL DEFAULT 'UNKNOWN',
    "category" "PartCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "priceKrw" INTEGER,
    "condition" "PartCondition",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parts_price_sourceUrl_idx" ON "parts_price"("sourceUrl");

-- CreateIndex
CREATE INDEX "parts_price_createdAt_idx" ON "parts_price"("createdAt" DESC);
