-- CreateTable
CREATE TABLE "valuation_results" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valuation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "valuation_results_createdAt_idx" ON "valuation_results"("createdAt" DESC);
