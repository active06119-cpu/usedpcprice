// ============================================================
// scripts/queries/example-queries.ts
// Reference file for the app layer (Cursor agent).
// These are NOT production code — they illustrate the DB interface.
// Copy and adapt these patterns into your service layer.
// ============================================================

/* eslint-disable @typescript-eslint/no-unused-vars */
import { PrismaClient, PartCondition, PartCategory } from '@prisma/client'

const prisma = new PrismaClient()

// ============================================================
// QUERY 1: Fair price range for a part
// Used by: seller flow, single-part flow
// Returns: low/mid/high based on recent snapshots
// ============================================================
async function getFairPriceRange(partId: string, condition: PartCondition, dayWindow = 60) {
  const since = new Date()
  since.setDate(since.getDate() - dayWindow)

  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      partId,
      capturedAt: { gte: since },
      // Optionally filter by condition; if no condition match found,
      // app layer should widen and apply AdjustmentRule multiplier instead.
      // condition: condition,
    },
    orderBy: { capturedAt: 'desc' },
    take: 30, // cap at 30 most recent — enough for statistical range
    select: { priceKrw: true, condition: true, capturedAt: true },
  })

  if (snapshots.length === 0) return null

  const prices = snapshots.map(s => s.priceKrw).sort((a, b) => a - b)
  const p10 = prices[Math.floor(prices.length * 0.1)]
  const p50 = prices[Math.floor(prices.length * 0.5)]
  const p90 = prices[Math.floor(prices.length * 0.9)]

  return { low: p10, mid: p50, high: p90, sampleSize: prices.length }
}

// ============================================================
// QUERY 2: Recent snapshots for a part (with pagination)
// Used by: price history view, debug/audit views
// ============================================================
async function getRecentSnapshots(partId: string, limit = 20, cursor?: string) {
  return prisma.priceSnapshot.findMany({
    where: { partId },
    orderBy: { capturedAt: 'desc' },
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    select: {
      id: true,
      priceKrw: true,
      condition: true,
      sourceType: true,
      sourceUrl: true,
      capturedAt: true,
    },
  })
}

// ============================================================
// QUERY 3: Look up a part by alias (used during listing parsing)
// Used by: listing extraction pipeline
// Returns: matched Part with specJson, or null
// ============================================================
async function findPartByAlias(rawText: string) {
  const normalized = rawText.toLowerCase().trim()

  const aliasMatch = await prisma.partAlias.findFirst({
    where: { alias: normalized },
    include: {
      part: {
        select: {
          id: true,
          fullName: true,
          category: true,
          brandName: true,
          modelName: true,
          releaseYear: true,
          specJson: true,
        },
      },
    },
  })

  return aliasMatch?.part ?? null
}

// ============================================================
// QUERY 4: Valuation history (for a session list or admin view)
// Used by: history/dashboard view
// ============================================================
async function getValuationHistory(limit = 20, cursor?: string) {
  return prisma.valuationRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    select: {
      id: true,
      runType: true,
      totalFairLow: true,
      totalFairMid: true,
      totalFairHigh: true,
      verdict: true,
      askingPriceKrw: true,
      createdAt: true,
      items: {
        select: {
          partId: true,
          rawPartLabel: true,
          fairMidKrw: true,
          part: { select: { fullName: true, category: true } },
        },
      },
    },
  })
}

// ============================================================
// QUERY 5: Full valuation run detail (for result display)
// Used by: result page
// ============================================================
async function getValuationDetail(valuationRunId: string) {
  return prisma.valuationRun.findUnique({
    where: { id: valuationRunId },
    include: {
      source: {
        select: { id: true, rawText: true, sourceUrl: true, inputType: true, parseStatus: true },
      },
      items: {
        include: {
          part: {
            select: { fullName: true, category: true, brandName: true, modelName: true, releaseYear: true },
          },
        },
        orderBy: { fairMidKrw: 'desc' },
      },
    },
  })
}

// ============================================================
// QUERY 6: Extracted parts from a listing
// Used by: buyer flow result display
// ============================================================
async function getListingParts(listingId: string) {
  return prisma.listingPartMatch.findMany({
    where: { listingId },
    include: {
      part: {
        select: { id: true, fullName: true, category: true, releaseYear: true },
      },
    },
    orderBy: { confidence: 'desc' },
  })
}

// ============================================================
// QUERY 7: Active adjustment rules (loaded at valuation time)
// Used by: valuation engine
// Returns rules in evaluation order
// ============================================================
async function getActiveAdjustmentRules() {
  return prisma.adjustmentRule.findMany({
    where: { isActive: true },
    orderBy: { priority: 'asc' },
    select: {
      id: true,
      name: true,
      category: true,
      ruleType: true,
      conditionKey: true,
      conditionValue: true,
      multiplier: true,
      flatOffsetKrw: true,
    },
  })
}

// ============================================================
// QUERY 8: Search parts by keyword (for manual spec entry)
// Used by: seller flow part picker
// Simple ILIKE search — good enough for MVP
// ============================================================
async function searchParts(keyword: string, category?: string) {
  const categoryEnum = category as PartCategory | undefined
  return prisma.part.findMany({
    where: {
      isActive: true,
      category: categoryEnum,
      OR: [
        { fullName: { contains: keyword, mode: 'insensitive' } },
        { modelName: { contains: keyword, mode: 'insensitive' } },
        { aliases: { some: { alias: { contains: keyword.toLowerCase() } } } },
      ],
    },
    select: {
      id: true,
      fullName: true,
      category: true,
      brandName: true,
      modelName: true,
      releaseYear: true,
      specJson: true,
    },
    take: 10,
    orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
  })
}

// ============================================================
// QUERY 9: Unmatched listing parts (for alias expansion backlog)
// Used by: admin/ops tooling — find gaps in part catalog
// ============================================================
async function getUnmatchedListingParts(limit = 50) {
  return prisma.listingPartMatch.findMany({
    where: { partId: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      rawPartText: true,
      matchMethod: true,
      createdAt: true,
      listing: { select: { id: true, rawText: true } },
    },
  })
}
