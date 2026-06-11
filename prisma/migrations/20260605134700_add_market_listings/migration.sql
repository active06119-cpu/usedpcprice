-- CreateTable
CREATE TABLE "market_listings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceKrw" INTEGER NOT NULL,
    "condition" "PartCondition" NOT NULL,
    "location" TEXT,
    "contact" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFairVerified" BOOLEAN NOT NULL DEFAULT false,
    "fairPriceMid" INTEGER,
    "valuationRunId" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_listings_pkey" PRIMARY KEY ("id")
);
