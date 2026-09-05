// DB/공식 시세 조회.

import { prisma } from "@/lib/prisma";
import {
  filterUsedPrices,
  isMidInValidRange,
  isValidNewPrice,
  isValidUsedPrice,
  shouldPersistUsedPrice,
} from "@/lib/engine/pricing";
import { validateAndCleanPrices } from "@/lib/engine/price-validator";
import {
  estimateGpuUsedPrice,
  estimateCpuUsedPrice,
  findGpuReferenceNewPrice,
  findCpuReferenceNewPrice,
  getGpuReferencePrice,
  getCpuReferencePrice,
} from "@/lib/engine/gpu-reference-prices";
import { aliasesCompatible } from "@/lib/ingest/part-alias";
import { ramPartKey } from "@/lib/ingest/ram-match";

import type { AnalyzedPart } from "./types";
import {
  attachPriceSource,
  categoryKeyword,
  isSanePriceForCategory,
  usedPriceMultiplierByCondition,
} from "./helpers";

export const USED_LOOKBACK_MS = 60 * 86_400_000;
export const NEW_LOOKBACK_MS = 14 * 86_400_000;

export const NEW_PRICE_SOURCES = ["NAVER_SHOPPING", "DANAWA"] as const;
export const REAL_USED_SOURCES = ["MANUAL", "BUNJANG", "DAANGN", "JOONGNA"] as const;
export const FORMULA_REFERENCE_YEAR = 2025;

export async function getNaverShoppingNewPrice(
  partId: string,
  partName: string,
  category: string,
): Promise<number | null> {
  const snaps = await prisma.priceSnapshot.findMany({
    where: {
      partId,
      sourceType: "NAVER_SHOPPING" as any,
      capturedAt: { gte: new Date(Date.now() - NEW_LOOKBACK_MS) },
    },
    select: { priceKrw: true },
    orderBy: { priceKrw: "asc" },
  });

  const fromDb = snaps
    .map((snap) => snap.priceKrw)
    .filter(
      (price) =>
        isValidNewPrice(price, partName, category) && isSanePriceForCategory(price, category),
    )
    .sort((a, b) => a - b)[0];

  if (fromDb) return fromDb;

  // 실시간 네이버 API는 요청당 1~2초 지연 — DB/참조표만 사용 (admin 배치에서 갱신)
  return null;
}

export function inferReleaseYearFromName(partName: string, category: string): number | null {
  const n = partName.toLowerCase();
  if (category === "GPU") {
    if (/50[789]0|5060/.test(n)) return 2025;
    if (/40[789]0|4060/.test(n)) return 2023;
    if (/30[789]0|3060/.test(n)) return 2020;
    if (/20[789]0|2060/.test(n)) return 2018;
  }
  if (category === "CPU") {
    if (/14900|14700|14600|14500/.test(n)) return 2023;
    if (/13900|13700|13600|13400/.test(n)) return 2022;
    if (/7950|7900|7800|7700|7600/.test(n)) return 2022;
    if (/5950|5900|5800|5600/.test(n)) return 2020;
  }
  return null;
}

export async function resolveReleaseYear(
  partId: string,
  partName: string,
  category: string,
): Promise<number | null> {
  const part = await prisma.part.findUnique({
    where: { id: partId },
    select: { releaseYear: true },
  });
  if (part?.releaseYear) return part.releaseYear;
  return inferReleaseYearFromName(partName, category);
}

export function depreciationMultiplier(category: string, ageYears: number): number {
  switch (category) {
    case "GPU":
      if (ageYears <= 1) return 0.82;
      if (ageYears === 2) return 0.65;
      if (ageYears === 3) return 0.5;
      return 0.4;
    case "CPU":
      if (ageYears <= 1) return 0.78;
      if (ageYears === 2) return 0.62;
      return 0.5;
    case "RAM":
    case "SSD":
    case "HDD":
      return 0.65;
    case "MOTHERBOARD":
    case "PSU":
    case "CASE":
      return 0.55;
    default:
      return 0.55;
  }
}

export async function resolveFormulaPriceFromNewProduct(
  partId: string,
  partName: string,
  category: string,
): Promise<{
  usedLow: number;
  usedMid: number;
  usedHigh: number;
  newPrice: number;
} | null> {
  const newPrice = await getNaverShoppingNewPrice(partId, partName, category);
  if (!newPrice) return null;

  const releaseYear = await resolveReleaseYear(partId, partName, category);
  const ageYears = releaseYear
    ? Math.max(0, FORMULA_REFERENCE_YEAR - releaseYear)
    : category === "GPU"
      ? 4
      : category === "CPU"
        ? 3
        : 2;
  const multiplier = depreciationMultiplier(category, ageYears);
  const usedMid = Math.round(newPrice * multiplier);
  if (!isSanePriceForCategory(usedMid, category)) return null;
  if (!shouldPersistUsedPrice(usedMid, partName, category)) return null;

  return {
    usedLow: Math.round(usedMid * 0.9),
    usedMid,
    usedHigh: Math.round(usedMid * 1.1),
    newPrice,
  };
}

export function toGpuEstimateCondition(condition: string): "GOOD" | "LIKE_NEW" | "FAIR" {
  const normalized = condition.toUpperCase();
  if (normalized === "LIKE_NEW" || normalized === "NEW") return "LIKE_NEW";
  if (normalized === "FAIR" || normalized === "POOR") return "FAIR";
  return "GOOD";
}

export async function resolveGpuReferenceFormulaPrice(
  part: AnalyzedPart,
): Promise<{
  usedLow: number;
  usedMid: number;
  usedHigh: number;
  newPrice: number;
} | null> {
  const releaseYear =
    (part.partId
      ? await resolveReleaseYear(part.partId, part.partName, part.category)
      : inferReleaseYearFromName(part.partName, part.category)) ?? 2020;

  const estimate = estimateGpuUsedPrice(
    part.partName,
    releaseYear,
    toGpuEstimateCondition(part.condition),
  );
  if (!estimate) return null;
  if (!isSanePriceForCategory(estimate.mid, "GPU")) return null;
  if (!shouldPersistUsedPrice(estimate.mid, part.partName, "GPU")) return null;

  const newPrice = getGpuReferencePrice(part.partName);
  if (!newPrice) return null;

  return {
    usedLow: estimate.low,
    usedMid: estimate.mid,
    usedHigh: estimate.high,
    newPrice,
  };
}

export async function resolveCpuReferenceFormulaPrice(
  part: AnalyzedPart,
): Promise<{
  usedLow: number;
  usedMid: number;
  usedHigh: number;
  newPrice: number;
} | null> {
  const releaseYear =
    (part.partId
      ? await resolveReleaseYear(part.partId, part.partName, part.category)
      : inferReleaseYearFromName(part.partName, part.category)) ?? 2020;

  const estimate = estimateCpuUsedPrice(
    part.partName,
    releaseYear,
    toGpuEstimateCondition(part.condition),
  );
  if (!estimate) return null;
  if (!isSanePriceForCategory(estimate.mid, "CPU")) return null;
  if (!shouldPersistUsedPrice(estimate.mid, part.partName, "CPU")) return null;

  const newPrice = getCpuReferencePrice(part.partName);
  if (!newPrice) return null;

  return {
    usedLow: estimate.low,
    usedMid: estimate.mid,
    usedHigh: estimate.high,
    newPrice,
  };
}

export const GPU_NEW_PRICE_REFERENCE_MIN = 200_000;
export const CPU_NEW_PRICE_REFERENCE_MIN = 100_000;

export function applyGpuReferenceNewPrice(
  partName: string,
  category: string,
  dbPrice: number | null,
): number | null {
  if (category !== "GPU") return dbPrice;
  if (dbPrice !== null && dbPrice >= GPU_NEW_PRICE_REFERENCE_MIN) return dbPrice;
  return findGpuReferenceNewPrice(partName) ?? dbPrice;
}

export function applyCpuReferenceNewPrice(
  partName: string,
  category: string,
  dbPrice: number | null,
): number | null {
  if (category !== "CPU") return dbPrice;
  if (dbPrice !== null && dbPrice >= CPU_NEW_PRICE_REFERENCE_MIN) return dbPrice;
  return findCpuReferenceNewPrice(partName) ?? dbPrice;
}

export function applyReferenceNewPrice(
  partName: string,
  category: string,
  dbPrice: number | null,
): number | null {
  return applyCpuReferenceNewPrice(
    partName,
    category,
    applyGpuReferenceNewPrice(partName, category, dbPrice),
  );
}

export async function getNewPrice(partId: string) {
  return prisma.priceSnapshot.findMany({
    where: {
      partId,
      sourceType: { in: [...NEW_PRICE_SOURCES] as any },
      capturedAt: { gte: new Date(Date.now() - NEW_LOOKBACK_MS) },
    },
    select: { priceKrw: true, sourceType: true, capturedAt: true },
    orderBy: { priceKrw: "asc" },
  });
}

export async function getUsedPrice(partId: string) {
  return prisma.priceSnapshot.findMany({
    where: {
      partId,
      sourceType: { in: [...REAL_USED_SOURCES] as any },
      capturedAt: { gte: new Date(Date.now() - USED_LOOKBACK_MS) },
    },
    select: { id: true, priceKrw: true, sourceType: true, capturedAt: true },
    orderBy: { capturedAt: "desc" },
  });
}

export async function getBuyoutPrice(partId: string) {
  return prisma.priceSnapshot.findFirst({
    where: { partId, sourceType: "BUYOUT" as any },
    orderBy: { capturedAt: "desc" },
    select: { priceKrw: true },
  });
}


export function quantileNearest(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx];
}

export function buildPriceBand(prices: number[]): {
  usedLow: number;
  usedMid: number;
  usedHigh: number;
  sampleSize: number;
} | null {
  if (prices.length === 0) return null;
  return {
    usedLow: quantileNearest(prices, 0.1),
    usedMid: quantileNearest(prices, 0.5),
    usedHigh: quantileNearest(prices, 0.9),
    sampleSize: prices.length,
  };
}

export function buildValidatedUsedBand(
  rawPrices: number[],
  partName: string,
  category: string,
  minSamples = 3,
) {
  const prices = filterUsedPrices(rawPrices, partName, category).sort((a, b) => a - b);
  if (prices.length < minSamples) return null;

  const band = buildPriceBand(prices);
  if (!band || !isMidInValidRange(band.usedMid, partName, category)) return null;
  return band;
}

export async function resolveNewProductPriceFromDb(
  partId: string,
  partName: string,
  category: string,
): Promise<{ price: number; sampleSize: number } | null> {
  const snaps = await getNewPrice(partId);
  const prices = snaps
    .map((snap) => snap.priceKrw)
    .filter(
      (price) =>
        isValidNewPrice(price, partName, category) && isSanePriceForCategory(price, category),
    )
    .sort((a, b) => a - b);

  const price = applyReferenceNewPrice(
    partName,
    category,
    prices.length > 0 ? prices[0] : null,
  );
  if (price === null) return null;
  return { price, sampleSize: prices.length };
}

export async function resolveUsedPriceFromDb(
  partId: string,
  partName: string,
  category: string,
  minSamples = 5,
): Promise<{
  usedLow: number;
  usedMid: number;
  usedHigh: number;
  sampleSize: number;
  newPrice: number | null;
  buyoutBasedLow: boolean;
} | null> {
  const usedSnaps = await getUsedPrice(partId);
  const { valid: validatedUsed, removedIds } = await validateAndCleanPrices(
    partId,
    category,
    usedSnaps.map((snap) => ({
      id: snap.id,
      priceKrw: snap.priceKrw,
      sourceType: snap.sourceType,
    })),
  );
  if (removedIds.length > 0) {
    await prisma.priceSnapshot.deleteMany({ where: { id: { in: removedIds } } });
  }

  const band = buildValidatedUsedBand(
    validatedUsed.map((snap) => snap.priceKrw),
    partName,
    category,
    minSamples,
  );
  if (!band) return null;

  const newSnaps = await getNewPrice(partId);
  const newPrices = newSnaps
    .map((snap) => snap.priceKrw)
    .filter(
      (price) =>
        isValidNewPrice(price, partName, category) && isSanePriceForCategory(price, category),
    )
    .sort((a, b) => a - b);
  const newPrice = applyReferenceNewPrice(
    partName,
    category,
    newPrices.length > 0 ? newPrices[0] : null,
  );

  const buyout = await getBuyoutPrice(partId);
  let usedLow = band.usedLow;
  let buyoutBasedLow = false;
  if (buyout?.priceKrw) {
    usedLow = Math.min(usedLow, buyout.priceKrw);
    buyoutBasedLow = buyout.priceKrw <= band.usedLow;
    if (buyoutBasedLow && !isValidUsedPrice(usedLow, partName, category)) {
      usedLow = band.usedLow;
      buyoutBasedLow = false;
    }
  }

  return { ...band, usedLow, newPrice, buyoutBasedLow };
}

export function buildApproxKeyword(partName: string, category?: string): string {
  let name = partName;
  if (category !== "RAM" && category !== "SSD") {
    name = name.replace(/\b\d+(?:\.\d+)?\s*(GB|TB)\b/gi, "");
  }
  // TI/SUPER are different SKUs; do not strip them.
  return name.replace(/\s+/g, " ").trim();
}

export async function resolveApproximatePrice(
  partName: string,
  category: string,
): Promise<{
  partId: string;
  usedLow: number;
  usedMid: number;
  usedHigh: number;
  sampleSize: number;
  newPrice: number | null;
  buyoutBasedLow: boolean;
} | null> {
  const keyword = buildApproxKeyword(partName, category);
  if (!keyword) return null;

  const similarParts = await prisma.part.findMany({
    where: {
      category: category as any,
      isActive: true,
      OR: [
        { fullName: { contains: keyword, mode: "insensitive" } },
        { modelName: { contains: keyword, mode: "insensitive" } },
      ],
    },
    select: { id: true, fullName: true, modelName: true },
    take: 30,
  });
  const similarPart = similarParts.find(
    (part) => aliasesCompatible(partName, part.fullName) || aliasesCompatible(partName, part.modelName),
  );
  if (!similarPart) return null;

  const resolved = await resolveUsedPriceFromDb(similarPart.id, partName, category);
  if (!resolved) return null;

  return { partId: similarPart.id, ...resolved };
}


export async function fetchNaverLowestPrice(partName: string, category: string): Promise<number | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const query = `${partName} ${categoryKeyword(category)}`.trim();
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=15&sort=sim`;

  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { items?: Array<{ lprice?: string }> };
  const prices = (data.items ?? [])
    .map((item) => Number(item.lprice))
    .filter((price) => Number.isFinite(price) && price > 0);
  if (prices.length === 0) return null;

  return Math.min(...prices);
}


export async function saveAiEstimatedBandSnapshots(
  partId: string,
  partName: string,
  category: string,
  condition: string,
  usedLow: number | null,
  usedMid: number | null,
  usedHigh: number | null,
): Promise<void> {
  if (!usedMid || usedMid <= 0) return;

  const low = usedLow && usedLow > 0 ? usedLow : Math.round(usedMid * 0.9);
  const mid = usedMid;
  const high = usedHigh && usedHigh > 0 ? usedHigh : Math.round(usedMid * 1.1);
  if (low > mid || mid > high) return;
  if (
    !shouldPersistUsedPrice(low, partName, category) ||
    !shouldPersistUsedPrice(mid, partName, category) ||
    !shouldPersistUsedPrice(high, partName, category)
  ) {
    return;
  }

  await prisma.priceSnapshot.createMany({
    data: [
      {
        partId,
        sourceType: "AI_ESTIMATED" as any,
        priceKrw: low,
        condition: (condition ?? "GOOD") as any,
        rawText: JSON.stringify({ source: "auto-analyze", band: "low" }),
      },
      {
        partId,
        sourceType: "AI_ESTIMATED" as any,
        priceKrw: mid,
        condition: (condition ?? "GOOD") as any,
        rawText: JSON.stringify({ source: "auto-analyze", band: "mid" }),
      },
      {
        partId,
        sourceType: "AI_ESTIMATED" as any,
        priceKrw: high,
        condition: (condition ?? "GOOD") as any,
        rawText: JSON.stringify({ source: "auto-analyze", band: "high" }),
      },
    ],
  });
}

// ── Step 1: AI 부품 추출 + 가격 추정 (Claude 1회) ─────────

export const RAM_STATIC_MID_KRW: Record<string, number> = {
  "ddr4:8": 28_000,
  "ddr4:16": 65_000,
  "ddr4:32": 120_000,
  "ddr5:16": 75_000,
  "ddr5:32": 110_000,
};

export async function resolveRamPriceFallback(part: AnalyzedPart): Promise<AnalyzedPart> {
  if (part.category !== "RAM" || part.usedMid !== null) return part;

  const ramPartId =
    part.partId ?? (await (await import("./parts")).findRamPartId(part.partName));
  if (ramPartId) {
    const dbPrice = await resolveUsedPriceFromDb(ramPartId, part.partName, "RAM", 3);
    if (dbPrice) {
      return attachPriceSource(
        {
          ...part,
          partId: ramPartId,
          approximated: dbPrice.sampleSize < 3,
          usedLow: dbPrice.usedLow,
          usedMid: dbPrice.usedMid,
          usedHigh: dbPrice.usedHigh,
          newPrice: dbPrice.newPrice,
          sampleSize: dbPrice.sampleSize,
          buyoutBasedLow: dbPrice.buyoutBasedLow,
        },
        "db",
      );
    }
  }

  const staticMid = RAM_STATIC_MID_KRW[ramPartKey(part.partName)];
  if (!staticMid) return part;

  return attachPriceSource(
    {
      ...part,
      partId: ramPartId,
      approximated: true,
      usedLow: Math.round(staticMid * 0.9),
      usedMid: staticMid,
      usedHigh: Math.round(staticMid * 1.1),
      newPrice: null,
      sampleSize: 0,
    },
    "ai",
  );
}

