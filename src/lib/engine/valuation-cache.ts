import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";

import type { ValuationResult } from "./pc-valuation";

export const VALUATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function normalizeListingText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function listingCacheId(text: string, hasImage = false): string {
  const raw = `${hasImage ? "img:" : "txt:"}${normalizeListingText(text)}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function isValuationPayload(value: unknown): value is ValuationResult {
  if (!value || typeof value !== "object") return false;
  const row = value as ValuationResult;
  return Array.isArray(row.priced) && typeof row.fairMid === "number";
}

export function applyAskingPrice(result: ValuationResult, asking: number | null | undefined): ValuationResult {
  const askingPriceKrw =
    typeof asking === "number" && asking > 0 ? asking : result.askingPriceKrw;
  const fairMid = result.fairMid;
  if (!askingPriceKrw || fairMid <= 0) {
    return { ...result, askingPriceKrw: askingPriceKrw ?? null, verdict: null, verdictKo: "가격 정보 없음" };
  }
  const ratio = askingPriceKrw / fairMid;
  const verdict =
    ratio <= 0.85 ? { code: "CHEAP", ko: "싸다 퇴" }
    : ratio <= 1.05 ? { code: "FAIR", ko: "적정가" }
    : ratio <= 1.25 ? { code: "OVERPRICED", ko: "약간 비쌈" }
    : { code: "WAY_OVERPRICED", ko: "많이 비쌈 ⚠️" };
  return {
    ...result,
    askingPriceKrw,
    verdict: verdict.code,
    verdictKo: verdict.ko,
  };
}

export async function readCachedValuation(
  prisma: PrismaClient,
  id: string,
): Promise<ValuationResult | null> {
  try {
    const row = await prisma.valuationResult.findUnique({ where: { id } });
    if (!row) return null;
    if (Date.now() - row.createdAt.getTime() > VALUATION_CACHE_TTL_MS) return null;
    return isValuationPayload(row.payload) ? row.payload : null;
  } catch (error) {
    console.error("[valuation-cache] read failed", error);
    return null;
  }
}

export async function writeCachedValuation(
  prisma: PrismaClient,
  id: string,
  result: ValuationResult,
): Promise<void> {
  try {
    await prisma.valuationResult.upsert({
      where: { id },
      create: { id, payload: result as object },
      update: { payload: result as object, createdAt: new Date() },
    });
  } catch (error) {
    console.error("[valuation-cache] write failed", error);
  }
}
