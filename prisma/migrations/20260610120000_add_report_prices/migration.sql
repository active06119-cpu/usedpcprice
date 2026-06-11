-- CreateEnum
CREATE TYPE "ReportPriceReason" AS ENUM ('too_high', 'too_low');

-- CreateTable
CREATE TABLE "report_prices" (
    "id" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "reportedPrice" INTEGER NOT NULL,
    "reason" "ReportPriceReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_prices_createdAt_idx" ON "report_prices"("createdAt" DESC);
