// src/app/api/analyze/route.ts
// 핵심 API — 매물 본문 붙여넣기 → 부품 추출 → 시세 조회 → 적정가 산출

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  filterUsedPrices,
  isMidInValidRange,
  isValidNewPrice,
  isValidUsedPrice,
  priceRangeByCategory,
  shouldPersistUsedPrice,
} from "@/lib/engine/pricing";
import {
  estimateGpuUsedPrice,
  estimateCpuUsedPrice,
  findGpuReferenceNewPrice,
  findCpuReferenceNewPrice,
  getGpuReferencePrice,
  getCpuReferencePrice,
} from "@/lib/engine/gpu-reference-prices";
import { validateAndCleanPrices } from "@/lib/engine/price-validator";

export interface AnalyzedPart {
  partId?: string | null;
  partName: string; // 정규화된 부품명
  category: string; // GPU / CPU / RAM 등
  condition: string; // 판매자가 명시한 상태
  conditionKo: string; // 상태 한국어
  approximated: boolean;
  // 시세
  usedMid: number | null; // 중고 권장가 (DB)
  usedLow: number | null; // 중고 하한
  usedHigh: number | null; // 중고 상한
  newPrice: number | null; // 신품 기준가
  priceSource: "db" | "formula" | "ai" | "new" | "validated";
  priceSourceLabel: string;
  sampleSize: number; // DB 샘플 수
  buyoutBasedLow?: boolean; // 하한가가 BUYOUT(업체 매입가) 기준인지
}

export interface AnalyzeResult {
  parts: AnalyzedPart[];
  askingPrice: number | null; // 판매자 요청가
  totalFairLow: number;
  totalFairMid: number;
  totalFairHigh: number;
  verdict: "CHEAP" | "FAIR" | "OVERPRICED" | "WAY_OVERPRICED" | "NO_PRICE";
  verdictKo: string;
  verdictReason: string;
  warnings: string[];
  missingPartsWarning: boolean;
  totalSampleSize: number;
  analysisMode: "used" | "new";
  analysisModeLabel: string;
}

function buildMissingPartsWarnings(extractedParts: { category: string }[]): {
  warnings: string[];
  missingPartsWarning: boolean;
} {
  const categories = new Set(extractedParts.map((part) => String(part.category).toUpperCase()));
  const hasGpu = categories.has("GPU");
  const hasCpu = categories.has("CPU");
  const missingWarnings: string[] = [];
  let missingPartsWarning = false;

  if (!hasGpu && !hasCpu) {
    missingWarnings.push("주요 부품이 인식되지 않았습니다");
    missingPartsWarning = true;
  } else if (!hasGpu || !hasCpu) {
    missingWarnings.push("일부 부품이 누락되었을 수 있습니다");
    missingPartsWarning = true;
  }

  if (extractedParts.length <= 3) {
    missingWarnings.push(
      "메인보드·파워·케이스 등 미포함 부품이 있으면 실제 가격과 다를 수 있습니다",
    );
  }

  return { warnings: missingWarnings, missingPartsWarning };
}

const SYSTEM_PART_CATEGORIES = ["MOTHERBOARD", "PSU", "CASE"] as const;

function missingSystemPartCategories(parts: { category: string }[]): string[] {
  const categories = new Set(parts.map((part) => String(part.category).toUpperCase()));
  if (!categories.has("GPU") || !categories.has("CPU")) return [];

  return SYSTEM_PART_CATEGORIES.filter((category) => !categories.has(category));
}

function normalizeSystemPartCategory(raw: string): string | null {
  const value = raw.toUpperCase();
  if (value === "MOTHERBOARD" || value === "MAINBOARD" || value.includes("BOARD")) return "MOTHERBOARD";
  if (value === "PSU" || value.includes("POWER")) return "PSU";
  if (value === "CASE") return "CASE";
  return null;
}

function withEstimateLabel(partName: string): string {
  const trimmed = partName.trim();
  if (trimmed.includes("(추정)")) return trimmed;
  return `${trimmed} (추정)`;
}

async function estimateMissingSystemParts(
  extractedParts: { partName: string; category: string }[],
  missingCategories: string[],
): Promise<AnalyzedPart[]> {
  const cpu = extractedParts.find((part) => part.category === "CPU")?.partName ?? "CPU";
  const gpu = extractedParts.find((part) => part.category === "GPU")?.partName ?? "GPU";
  const missingLabels = missingCategories.map((category) => categoryKeyword(category)).join("/");

  const aiRaw = await callClaude(
    "너는 2025년 한국 중고 PC 부품 시세 전문가야. 번개장터·당근·중고나라 기준으로 JSON만 반환해.",
    `CPU: ${cpu}\nGPU: ${gpu}\n\n위 CPU/GPU 조합에 맞는 평균적인 중고 ${missingLabels} 가격을 추정해줘.\n\n반드시 JSON만:\n{\n  "parts": [\n    {\n      "partName": "B650M 메인보드",\n      "category": "MOTHERBOARD",\n      "usedMid": 80000,\n      "usedLow": 70000,\n      "usedHigh": 90000\n    }\n  ]\n}`,
  );

  const cleaned = aiRaw.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]) as {
    parts?: any[];
    prices?: any[];
    items?: any[];
  };
  const rows: any[] = Array.isArray(parsed.parts)
    ? parsed.parts
    : parsed?.prices ?? parsed?.items ?? [];

  const allowed = new Set(missingCategories);
  const estimated: AnalyzedPart[] = [];

  for (const row of rows) {
    const category = normalizeSystemPartCategory(String(row.category ?? ""));
    if (!category || !allowed.has(category)) continue;

    const usedMid = Number(row.usedMid ?? row.price ?? row.usedPrice ?? 0);
    if (!Number.isFinite(usedMid) || usedMid <= 0) continue;
    if (!isSanePriceForCategory(usedMid, category)) continue;

    const usedLow = Number(row.usedLow ?? Math.round(usedMid * 0.9));
    const usedHigh = Number(row.usedHigh ?? Math.round(usedMid * 1.1));
    const partName = withEstimateLabel(String(row.partName ?? categoryKeyword(category)));

    estimated.push(
      attachPriceSource(
        {
          partName,
          category,
          condition: "GOOD",
          conditionKo: "사용감 적음",
          approximated: true,
          partId: null,
          usedLow: usedLow > 0 ? usedLow : Math.round(usedMid * 0.9),
          usedMid,
          usedHigh: usedHigh > 0 ? usedHigh : Math.round(usedMid * 1.1),
          newPrice: null,
          sampleSize: 0,
        },
        "ai",
      ),
    );
    allowed.delete(category);
  }

  return estimated;
}

function extractBrandName(partName: string): string {
  const n = partName.toLowerCase();
  if (/\brtx\b|\bgtx\b|\bnvidia\b|\bgeforce\b/.test(n)) return "NVIDIA";
  if (/\bryzen\b|\bradeon\b/.test(n) || /\brx\s*\d/i.test(partName)) return "AMD";
  if (/\b(i3|i5|i7|i9)[-\s_]?\d/i.test(partName) || /\bintel\b|\bcore i[3579]\b/.test(n)) {
    return "Intel";
  }
  if (n.includes("amd")) return "AMD";
  if (n.includes("samsung")) return "Samsung";
  const first = partName.trim().split(/\s+/)[0];
  return first || "UNKNOWN";
}

function categoryKeyword(category: string): string {
  switch (category) {
    case "GPU":
      return "그래픽카드";
    case "CPU":
      return "CPU";
    case "RAM":
      return "메모리";
    case "SSD":
      return "SSD";
    case "HDD":
      return "하드디스크";
    case "MOTHERBOARD":
      return "메인보드";
    case "PSU":
      return "파워서플라이";
    case "CASE":
      return "PC케이스";
    case "COOLER":
      return "쿨러";
    default:
      return "부품";
  }
}

function minNewPriceByCategory(category: string): number {
  switch (category) {
    case "GPU":
      return 200_000;
    case "CPU":
      return 80_000;
    case "RAM":
      return 30_000;
    default:
      return 0;
  }
}

function usedPriceMultiplierByCondition(condition: string | null | undefined): number {
  const normalized = (condition ?? "GOOD").toUpperCase();
  if (normalized === "NEW" || normalized === "LIKE_NEW") return 0.9;
  if (normalized === "GOOD") return 0.7;
  if (normalized === "FAIR") return 0.55;
  return 0.7;
}

function isSanePriceForCategory(priceKrw: number, category: string): boolean {
  const limits = {
    GPU: [20_000, 5_000_000],
    CPU: [15_000, 2_000_000],
    RAM: [10_000, 500_000],
    SSD: [10_000, 1_500_000],
    MOTHERBOARD: [20_000, 1_500_000],
    PSU: [15_000, 600_000],
  };
  const [min, max] = (limits as unknown as Record<string, [number, number]>)[category] ?? [
    1_000, 10_000_000,
  ];
  return priceKrw >= min && priceKrw <= max;
}

// ── 시세 소스 분리 쿼리 ───────────────────────────────────
const USED_LOOKBACK_MS = 60 * 86_400_000;
const NEW_LOOKBACK_MS = 14 * 86_400_000;

const NEW_PRICE_SOURCES = ["NAVER_SHOPPING", "DANAWA"] as const;
const REAL_USED_SOURCES = ["MANUAL", "BUNJANG", "DAANGN", "JOONGNA"] as const;
const FORMULA_REFERENCE_YEAR = 2025;

async function getNaverShoppingNewPrice(
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

  const live = await fetchNaverLowestPrice(partName, category);
  if (
    live &&
    isValidNewPrice(live, partName, category) &&
    isSanePriceForCategory(live, category)
  ) {
    return live;
  }

  return null;
}

function inferReleaseYearFromName(partName: string, category: string): number | null {
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

async function resolveReleaseYear(
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

function depreciationMultiplier(category: string, ageYears: number): number {
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

async function resolveFormulaPriceFromNewProduct(
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

function toGpuEstimateCondition(condition: string): "GOOD" | "LIKE_NEW" | "FAIR" {
  const normalized = condition.toUpperCase();
  if (normalized === "LIKE_NEW" || normalized === "NEW") return "LIKE_NEW";
  if (normalized === "FAIR" || normalized === "POOR") return "FAIR";
  return "GOOD";
}

async function resolveGpuReferenceFormulaPrice(
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

async function resolveCpuReferenceFormulaPrice(
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

const GPU_NEW_PRICE_REFERENCE_MIN = 200_000;
const CPU_NEW_PRICE_REFERENCE_MIN = 100_000;

function applyGpuReferenceNewPrice(
  partName: string,
  category: string,
  dbPrice: number | null,
): number | null {
  if (category !== "GPU") return dbPrice;
  if (dbPrice !== null && dbPrice >= GPU_NEW_PRICE_REFERENCE_MIN) return dbPrice;
  return findGpuReferenceNewPrice(partName) ?? dbPrice;
}

function applyCpuReferenceNewPrice(
  partName: string,
  category: string,
  dbPrice: number | null,
): number | null {
  if (category !== "CPU") return dbPrice;
  if (dbPrice !== null && dbPrice >= CPU_NEW_PRICE_REFERENCE_MIN) return dbPrice;
  return findCpuReferenceNewPrice(partName) ?? dbPrice;
}

function applyReferenceNewPrice(
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

async function getNewPrice(partId: string) {
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

async function getUsedPrice(partId: string) {
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

async function getBuyoutPrice(partId: string) {
  return prisma.priceSnapshot.findFirst({
    where: { partId, sourceType: "BUYOUT" as any },
    orderBy: { capturedAt: "desc" },
    select: { priceKrw: true },
  });
}

function priceSourceLabelFor(source: AnalyzedPart["priceSource"]): string {
  switch (source) {
    case "db":
      return "DB (실거래)";
    case "formula":
      return "신품가 기반 추정";
    case "ai":
      return "AI 추정";
    case "new":
      return "신품가";
    case "validated":
      return "AI 검증 보정";
  }
}

function attachNewModePriceSource<T extends Omit<AnalyzedPart, "priceSourceLabel" | "priceSource">>(
  part: T,
  source: "db" | "ai",
): AnalyzedPart {
  return {
    ...part,
    priceSource: source === "db" ? "new" : "ai",
    priceSourceLabel: source === "db" ? "신품 최저가" : "신품가 (추정)",
    approximated: source === "ai",
  };
}

function attachPriceSource<T extends Omit<AnalyzedPart, "priceSourceLabel" | "priceSource">>(
  part: T,
  source: AnalyzedPart["priceSource"],
): AnalyzedPart {
  return { ...part, priceSource: source, priceSourceLabel: priceSourceLabelFor(source) };
}

function quantileNearest(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx];
}

function buildPriceBand(prices: number[]): {
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

function buildValidatedUsedBand(
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

async function resolveNewProductPriceFromDb(
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

async function resolveUsedPriceFromDb(
  partId: string,
  partName: string,
  category: string,
  minSamples = 3,
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

function buildApproxKeyword(partName: string, category?: string): string {
  let name = partName;
  if (category !== "RAM" && category !== "SSD") {
    name = name.replace(/\b\d+(?:\.\d+)?\s*(GB|TB)\b/gi, "");
  }
  return name
    .replace(/\b(TI|SUPER|OC|LHR)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveApproximatePrice(
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

  const similarPart = await prisma.part.findFirst({
    where: {
      category: category as any,
      OR: [
        { fullName: { contains: keyword, mode: "insensitive" } },
        { modelName: { contains: keyword, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (!similarPart) return null;

  const resolved = await resolveUsedPriceFromDb(similarPart.id, partName, category);
  if (!resolved) return null;

  return { partId: similarPart.id, ...resolved };
}

async function crossValidatePartPrice(
  part: AnalyzedPart,
): Promise<{ part: AnalyzedPart; warnings: string[] }> {
  const warnings: string[] = [];
  if (!part.usedMid || part.usedMid <= 0) return { part, warnings };

  let updated: AnalyzedPart = { ...part };

  if (part.partId) {
    const buyout = await getBuyoutPrice(part.partId);
    if (buyout?.priceKrw && updated.usedMid != null && updated.usedMid < buyout.priceKrw) {
      updated = {
        ...updated,
        usedMid: Math.round(buyout.priceKrw * 1.2),
        usedLow: Math.round(buyout.priceKrw * 1.2 * 0.9),
        usedHigh: Math.round(buyout.priceKrw * 1.2 * 1.1),
        buyoutBasedLow: true,
      };
      warnings.push(`${part.partName}: 매입가 기준으로 보정됨`);
    }
  }

  if (updated.usedMid && updated.newPrice && updated.usedMid > updated.newPrice) {
    updated = {
      ...updated,
      usedMid: Math.round(updated.newPrice * 0.88),
    };
  }

  if (
    updated.newPrice != null &&
    updated.newPrice > 0 &&
    updated.priceSource !== "new" &&
    updated.usedMid != null &&
    updated.usedMid > updated.newPrice * 0.92
  ) {
    warnings.push(`${updated.partName}: 신품가와 차이가 거의 없습니다`);
  }

  return { part: updated, warnings };
}

async function crossValidateParts(parts: AnalyzedPart[]): Promise<{
  parts: AnalyzedPart[];
  warnings: string[];
}> {
  const validated: AnalyzedPart[] = [];
  const allWarnings: string[] = [];

  for (const part of parts) {
    const { part: next, warnings } = await crossValidatePartPrice(part);
    validated.push(next);
    allWarnings.push(...warnings);
  }

  return { parts: validated, warnings: allWarnings };
}

type SuspiciousPartCandidate = {
  index: number;
  partName: string;
  calculatedPrice: number;
  formulaPrice: number | null;
  buyoutPrice: number | null;
};

type ClaudeValidationResult = {
  partName: string;
  isValid: boolean;
  correctedPrice: number | null;
};

async function resolveReferenceFormulaMid(part: AnalyzedPart): Promise<number | null> {
  if (part.category === "GPU") {
    const formula = await resolveGpuReferenceFormulaPrice(part);
    return formula?.usedMid ?? null;
  }
  if (part.category === "CPU") {
    const formula = await resolveCpuReferenceFormulaPrice(part);
    return formula?.usedMid ?? null;
  }
  if (!part.partId) return null;
  const formula = await resolveFormulaPriceFromNewProduct(part.partId, part.partName, part.category);
  return formula?.usedMid ?? null;
}

function isSuspiciousUsedPrice(
  usedMid: number,
  formulaPrice: number | null,
  buyoutPrice: number | null,
): boolean {
  if (buyoutPrice !== null && buyoutPrice > 0 && usedMid < buyoutPrice) return true;
  if (!formulaPrice || formulaPrice <= 0) return false;
  if (usedMid < formulaPrice * 0.5) return true;
  if (usedMid > formulaPrice * 2.0) return true;
  return false;
}

function parseClaudeValidationResults(raw: string): ClaudeValidationResult[] {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  const payload = arrayMatch?.[0] ?? objectMatch?.[0];
  if (!payload) return [];

  const parsed = JSON.parse(payload) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown[] }).items)
      ? (parsed as { items: unknown[] }).items
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { results?: unknown[] }).results)
        ? (parsed as { results: unknown[] }).results
        : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const correctedRaw = item.correctedPrice;
      const correctedPrice =
        correctedRaw === null || correctedRaw === undefined
          ? null
          : Number(correctedRaw);
      return {
        partName: String(item.partName ?? ""),
        isValid: item.isValid !== false,
        correctedPrice:
          correctedPrice !== null && Number.isFinite(correctedPrice) && correctedPrice > 0
            ? correctedPrice
            : null,
      } satisfies ClaudeValidationResult;
    })
    .filter((row): row is ClaudeValidationResult => Boolean(row?.partName));
}

async function collectSuspiciousParts(parts: AnalyzedPart[]): Promise<SuspiciousPartCandidate[]> {
  const suspicious: SuspiciousPartCandidate[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part.usedMid || part.usedMid <= 0) continue;

    const formulaPrice = await resolveReferenceFormulaMid(part);
    const buyout = part.partId ? await getBuyoutPrice(part.partId) : null;
    const buyoutPrice = buyout?.priceKrw ?? null;

    if (!isSuspiciousUsedPrice(part.usedMid, formulaPrice, buyoutPrice)) continue;

    suspicious.push({
      index: i,
      partName: part.partName,
      calculatedPrice: part.usedMid,
      formulaPrice,
      buyoutPrice,
    });
  }

  return suspicious;
}

async function validateSuspiciousPartPrices(parts: AnalyzedPart[]): Promise<{
  parts: AnalyzedPart[];
  warnings: string[];
}> {
  const suspicious = await collectSuspiciousParts(parts);
  if (suspicious.length === 0) return { parts, warnings: [] };

  const prompt = `다음 부품들의 중고 가격이 합리적인지 확인해줘.
한국 2025년 번개장터/당근마켓 기준.

검증 대상:
${JSON.stringify(
  suspicious.map(({ partName, calculatedPrice, formulaPrice, buyoutPrice }) => ({
    partName,
    calculatedPrice,
    formulaPrice,
    buyoutPrice,
  })),
  null,
  2,
)}

각 항목마다 JSON으로:
{ partName, isValid: true/false, correctedPrice: null or 숫자 }

명백히 틀린 것만 correctedPrice 제시.
확실하지 않으면 isValid: true 유지.

JSON 배열만 반환해.`;

  try {
    const raw = await callClaude(
      "너는 한국 중고 PC 부품 시세 검증 전문가야. 요청된 JSON 배열만 반환해.",
      prompt,
    );
    const results = parseClaudeValidationResults(raw);
    if (results.length === 0) return { parts, warnings: [] };

    const updated = parts.map((part) => ({ ...part }));
    const warnings: string[] = [];

    for (const result of results) {
      if (result.isValid !== false || result.correctedPrice === null) continue;

      const candidate =
        suspicious.find((item) => partNamesMatch(item.partName, result.partName)) ??
        suspicious.find((item) => item.partName === result.partName);
      if (!candidate) continue;

      const previous = updated[candidate.index];
      if (!previous.usedMid) continue;
      if (!isSanePriceForCategory(result.correctedPrice, previous.category)) continue;
      if (!shouldPersistUsedPrice(result.correctedPrice, previous.partName, previous.category)) {
        continue;
      }

      updated[candidate.index] = {
        ...previous,
        usedMid: result.correctedPrice,
        usedLow: Math.round(result.correctedPrice * 0.9),
        usedHigh: Math.round(result.correctedPrice * 1.1),
        priceSource: "validated",
        priceSourceLabel: priceSourceLabelFor("validated"),
        approximated: false,
      };
      warnings.push(
        `${previous.partName}: AI 검증 보정 (₩${previous.usedMid.toLocaleString()} → ₩${result.correctedPrice.toLocaleString()})`,
      );
    }

    return { parts: updated, warnings };
  } catch (error) {
    console.error("의심 가격 Claude 검증 실패:", error);
    return { parts, warnings: [] };
  }
}

async function fetchNaverLowestPrice(partName: string, category: string): Promise<number | null> {
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

async function ensurePartForUnmatched(partName: string, category: string): Promise<string | null> {
  const brandName = extractBrandName(partName);
  const cat = category.toUpperCase();

  try {
    const part = await prisma.part.upsert({
      where: {
        category_brandName_modelName: {
          category: cat as any,
          brandName,
          modelName: partName,
        },
      },
      create: {
        category: cat as any,
        brandName,
        modelName: partName,
        fullName: partName,
        isActive: true,
      },
      update: {
        fullName: partName,
        isActive: true,
      },
      select: { id: true },
    });
    return part.id;
  } catch (error) {
    console.error("ensurePartForUnmatched upsert failed:", error);
    const retry = await prisma.part.findFirst({
      where: {
        category: cat as any,
        OR: [
          { fullName: { equals: partName, mode: "insensitive" } },
          { modelName: { equals: partName, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    return retry?.id ?? null;
  }
}

async function saveAiEstimatedBandSnapshots(
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

// ── Step 1: AI 부품 추출 ─────────────────────────────────
const EXTRACT_SYSTEM = `
너는 한국 중고마켓 PC 매물 텍스트 파서야. 부품과 가격을 추출해서 JSON으로만 반환해.

=== 부품명 정규화 규칙 ===
한국어/약칭을 반드시 영문 표준명으로 변환:
- "4070", "지포스4070", "rtx4070", "지포스 4070" → "RTX 4070"
- "4070ti", "4070 티아이", "4070TI" → "RTX 4070 Ti"
- "4070 슈퍼", "4070s" → "RTX 4070 SUPER"
- "3080", "지포스 3080" → "RTX 3080"
- "7900xtx", "라데온 7900" → "RX 7900 XTX"
- "아이5 13600k", "i5-13600k", "인텔 13600k" → "Core i5-13600K"
- "아이7 14700k", "i7 14700" → "Core i7-14700K"
- "라이젠 5600x", "r5 5600x", "5600엑스" → "Ryzen 5 5600X"
- "라이젠 7800x3d", "7800x3d" → "Ryzen 7 7800X3D"
- "980프로 1테라", "980pro 1tb" → "Samsung 980 PRO 1TB"

=== RAM(메모리) — 빠뜨리지 말 것 ===
매물에 RAM/램/메모리/DDR4/DDR5/기가/GB 표기가 있으면 반드시 parts에 RAM으로 추가.
다음은 모두 category: RAM, partName: "DDR4 16GB" 로 정규화 (용량·세대에 맞게 변환):
- "DDR4 16GB", "DDR4 16G", "램 16기가", "16GB RAM" → partName: "DDR4 16GB", category: RAM
- "ddr4 32g", "램 32기가", "32GB RAM" → partName: "DDR4 32GB", category: RAM
- "DDR5 32GB", "ddr5 32g", "램 ddr5 32기가" → partName: "DDR5 32GB", category: RAM
- "삼성 32기가", "ddr4 32g" → "Samsung DDR4 32GB" (브랜드 있으면 포함)
- PC 본체/완본 매물에 "16기가", "32기가램", "램 16"만 있어도 RAM으로 추출

=== 가격 추출 규칙 ===
- "52만" / "52만원" / "520,000" / "52만에" → 520000
- "130만" / "1300000" / "130만원" → 1300000
- "네고가능 50만" → 500000
- "가격제안" / "가격미정" / 가격 없음 → null

=== 상태 판단 ===
NEW: 미개봉, 새제품, 신품, 봉인
LIKE_NEW: 개봉만, 거의새것, 미사용, 풀박스, 1주일
GOOD: 사용감없음, 깨끗, 3개월이하, 상급, A급, 박스있음
FAIR: 사용감있음, 6개월이상, 1년, B급, 박스없음
POOR: 불량, 파손, 부품용, 고장, 스크래치심함
명시 없으면: GOOD

=== 카테고리 ===
GPU(그래픽카드), CPU(프로세서), RAM(메모리), SSD, HDD, MOTHERBOARD(메인보드), PSU(파워), CASE(케이스), COOLER(쿨러)

=== 2025년 한국 중고 시세 추정 (각 부품마다 필수) ===
번개장터·당근·중고나라 GOOD 상태 기준. 원(KRW) 정수.
- GPU: 출시 1년 신품 65~75%, 2년 50~65%, 3년+ 35~55%
- CPU: 신품 55~70%, RAM 45~60%, SSD 40~55%, 메인보드 40~60%, PSU 35~50%
- 신품가는 네이버쇼핑 기준 추정, 지나치게 낮거나 높은 가격 금지

=== 출력 형식 ===
반드시 JSON만. 설명 없음. 마크다운 없음.
{
  "askingPrice": 1200000,
  "parts": [
    {
      "partName": "RTX 4070 SUPER",
      "category": "GPU",
      "condition": "GOOD",
      "conditionKo": "사용감 적음",
      "estimatedUsedMid": 550000,
      "estimatedUsedLow": 480000,
      "estimatedUsedHigh": 620000,
      "estimatedNewPrice": 680000
    }
  ]
}
`;

async function extractListingFromText(text: string): Promise<{ askingPrice: number | null; parts: any[] }> {
  const raw = await callClaude(EXTRACT_SYSTEM, text);
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("JSON not found in extraction response.");
  }

  const parsed = JSON.parse(jsonMatch[0]) as { askingPrice?: number | null; parts?: any[] };
  const parts = normalizeExtractedParts(Array.isArray(parsed.parts) ? parsed.parts : []);
  return {
    askingPrice: typeof parsed.askingPrice === "number" ? parsed.askingPrice : null,
    parts: supplementRamPartsFromText(text, parts),
  };
}

function parseOptionalEstimate(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function partNamesMatch(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left.includes(right) || right.includes(left);
}

function parseExtractedEstimates(part: {
  estimatedUsedMid?: unknown;
  estimatedUsedLow?: unknown;
  estimatedUsedHigh?: unknown;
  estimatedNewPrice?: unknown;
}) {
  const usedMid = parseOptionalEstimate(part.estimatedUsedMid);
  if (!usedMid) return null;

  const usedLow = parseOptionalEstimate(part.estimatedUsedLow);
  const usedHigh = parseOptionalEstimate(part.estimatedUsedHigh);
  const newPrice = parseOptionalEstimate(part.estimatedNewPrice);

  return {
    usedMid,
    usedLow: usedLow ?? Math.round(usedMid * 0.9),
    usedHigh: usedHigh ?? Math.round(usedMid * 1.1),
    newPrice,
  };
}

function applyExtractedEstimatesToResolved(
  resolvedParts: AnalyzedPart[],
  extractedParts: any[],
): void {
  for (let i = 0; i < resolvedParts.length; i += 1) {
    const part = resolvedParts[i];
    if (part.usedMid !== null && part.usedMid > 0) continue;

    const extracted = extractedParts.find((row) => partNamesMatch(part.partName, row.partName));
    if (!extracted) continue;

    const estimate = parseExtractedEstimates(extracted);
    if (!estimate || !isSanePriceForCategory(estimate.usedMid, part.category)) continue;

    resolvedParts[i] = attachPriceSource(
      {
        ...part,
        usedLow: estimate.usedLow,
        usedMid: estimate.usedMid,
        usedHigh: estimate.usedHigh,
        newPrice: estimate.newPrice,
        approximated: false,
        sampleSize: 0,
      },
      "ai",
    );
  }
}

function normalizeExtractedParts(parts: any[]): any[] {
  return parts.map((part) => {
    const rawCategory = String(part.category ?? "").toUpperCase();
    const category =
      rawCategory === "MEMORY" || rawCategory === "MEM" || rawCategory === "메모리" ? "RAM" : rawCategory;

    return {
      ...part,
      partName: String(part.partName ?? "").trim(),
      category,
      condition: String(part.condition ?? "GOOD").toUpperCase(),
      conditionKo: part.conditionKo ?? "사용감 적음",
      estimatedUsedMid: parseOptionalEstimate(part.estimatedUsedMid),
      estimatedUsedLow: parseOptionalEstimate(part.estimatedUsedLow),
      estimatedUsedHigh: parseOptionalEstimate(part.estimatedUsedHigh),
      estimatedNewPrice: parseOptionalEstimate(part.estimatedNewPrice),
    };
  });
}

function ramPartKey(partName: string): string {
  const lower = partName.toLowerCase();
  const gen = /\bddr5\b/.test(lower) ? "ddr5" : "ddr4";
  const cap = lower.match(/(\d+)\s*(?:gb|g)\b/)?.[1] ?? lower.match(/\b(\d{1,3})\b/)?.[1] ?? "";
  return `${gen}:${cap}`;
}

/** SSD/NVMe 문맥의 용량만 제외. DDR4 16GB 옆에 SSD가 있어도 RAM으로 인식 */
function shouldSkipRamMatch(matchText: string, text: string, index: number, matchLength: number): boolean {
  if (/ddr[45]/i.test(matchText)) return false;
  if (/(램|ram|memory|메모리)/i.test(matchText)) return false;

  const ctx = text.slice(Math.max(0, index - 16), index + matchLength + 16).toLowerCase();
  const storageHint = /\b(ssd|nvme|hdd|m\.2)\b/.test(ctx);
  const ramHint = /(ddr4|ddr5|램|ram|memory|메모리)/.test(ctx);
  return storageHint && !ramHint;
}

/** AI 추출과 무관하게 매물 본문에서 RAM을 규칙 기반으로 추출·병합 */
function supplementRamPartsFromText(text: string, parts: any[]): any[] {
  const result = [...parts];
  const seen = new Set(
    parts
      .filter((part) => part.category === "RAM")
      .map((part) => ramPartKey(part.partName))
      .filter((key) => !key.endsWith(":")),
  );

  const defaultGen = /\bddr5\b/i.test(text) ? "DDR5" : "DDR4";

  const patterns: Array<{ regex: RegExp; build: (match: RegExpExecArray) => string | null }> = [
    {
      regex: /(ddr[45])\s*[- ]?\s*(\d+)\s*(?:gb|g)\b/gi,
      build: (m) => `${m[1].toUpperCase()} ${m[2]}GB`,
    },
    {
      regex: /(?:램|메모리|ram)\s*(\d+)\s*(?:기가|gb|g)?/gi,
      build: (m) => {
        const gb = Number(m[1]);
        if (gb < 4 || gb > 256) return null;
        return `${defaultGen} ${gb}GB`;
      },
    },
    {
      regex: /(?:램|메모리|ram)(\d+)\s*(?:기가|gb|g)?/gi,
      build: (m) => {
        const gb = Number(m[1]);
        if (gb < 4 || gb > 256) return null;
        return `${defaultGen} ${gb}GB`;
      },
    },
    {
      regex: /(\d+)\s*(?:gb|g)\s*(?:램|ram|memory|메모리)\b/gi,
      build: (m) => `${defaultGen} ${m[1]}GB`,
    },
    {
      regex: /(?:^|[\s/|,·])(\d+)\s*기가(?:램)?(?=[\s/|,·]|$)/gi,
      build: (m) => {
        const gb = Number(m[1]);
        if (gb < 4 || gb > 256) return null;
        return `${defaultGen} ${gb}GB`;
      },
    },
    {
      regex: /(?:^|[\s/|,·])(\d+)\s*g(?=[\s/|,·]|$)/gi,
      build: (m) => {
        const gb = Number(m[1]);
        if (gb < 4 || gb > 128) return null;
        return `${defaultGen} ${gb}GB`;
      },
    },
  ];

  for (const { regex, build } of patterns) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (shouldSkipRamMatch(match[0], text, match.index, match[0].length)) continue;

      const partName = build(match);
      if (!partName) continue;

      const key = ramPartKey(partName);
      if (!key.endsWith(":") && seen.has(key)) continue;
      if (key.endsWith(":")) continue;

      seen.add(key);
      result.push({
        partName,
        category: "RAM",
        condition: "GOOD",
        conditionKo: "사용감 적음",
      });
    }
  }

  return result;
}

const RAM_STATIC_MID_KRW: Record<string, number> = {
  "ddr4:8": 28_000,
  "ddr4:16": 65_000,
  "ddr4:32": 120_000,
  "ddr5:16": 75_000,
  "ddr5:32": 110_000,
};

async function resolveRamPriceFallback(part: AnalyzedPart): Promise<AnalyzedPart> {
  if (part.category !== "RAM" || part.usedMid !== null) return part;

  const ramPartId = part.partId ?? (await findRamPartId(part.partName));
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

async function findRamPartId(partName: string): Promise<string | null> {
  const lower = partName.toLowerCase();
  const ddr = /\bddr5\b/.test(lower) ? "DDR5" : /\bddr4\b/.test(lower) ? "DDR4" : null;
  const capMatch = lower.match(/\b(\d+)\s*(?:gb|g)\b/) ?? lower.match(/\b(\d+)\b/);
  const capacity = capMatch ? Number(capMatch[1]) : null;
  if (!capacity || capacity < 4 || capacity > 256) return null;

  const gen = ddr ?? "DDR4";
  const candidates = await prisma.part.findMany({
    where: {
      category: "RAM",
      isActive: true,
      fullName: { contains: gen, mode: "insensitive" },
    },
    select: { id: true, fullName: true },
  });

  const matched = candidates.filter((part) => {
    const fn = part.fullName.toLowerCase();
    if (!fn.includes(String(capacity))) return false;
    if (ddr && !fn.includes(ddr.toLowerCase())) return false;
    return true;
  });

  if (matched.length === 0) return null;

  const wantsKit = /kit|2x|x2|키트/i.test(partName);
  if (!wantsKit) {
    const single = matched.find(
      (part) => /단일|single/i.test(part.fullName) || !/키트|kit|2x/i.test(part.fullName),
    );
    if (single) return single.id;
  }

  return matched[0].id;
}

async function resolvePartId(partName: string, category: string): Promise<string | null> {
  const cat = category.toUpperCase();
  const nameLower = partName.toLowerCase();

  if (cat === "RAM") {
    const ramId = await findRamPartId(partName);
    if (ramId) return ramId;
  }

  const aliasRows = await prisma.partAlias.findMany({
    where: {
      OR: [
        { alias: { contains: nameLower } },
        { alias: { equals: nameLower } },
      ],
    },
    select: { partId: true, alias: true, part: { select: { category: true } } },
    take: 20,
  });

  const aliasHit = aliasRows.find(
    (row) =>
      row.part.category === cat &&
      (nameLower.includes(row.alias) || row.alias.includes(nameLower)),
  );
  if (aliasHit) return aliasHit.partId;

  const part = await prisma.part.findFirst({
    where: {
      category: cat as any,
      OR: [
        { fullName: { contains: partName, mode: "insensitive" } },
        { modelName: { contains: partName, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });

  return part?.id ?? null;
}

const ANALYSIS_MODE_LABEL: Record<AnalyzeResult["analysisMode"], string> = {
  used: "중고 시세 기준",
  new: "신품가 기준",
};

function buildVerdict(
  asking: number | null,
  totalFairMid: number,
  analysisMode: "used" | "new",
): Pick<AnalyzeResult, "verdict" | "verdictKo" | "verdictReason"> {
  const priceLabel = analysisMode === "new" ? "신품 최저가" : "적정가";

  if (!asking || totalFairMid <= 0) {
    return {
      verdict: "NO_PRICE",
      verdictKo: "가격 정보 없음",
      verdictReason: "판매자 요청가가 없어 비교할 수 없습니다.",
    };
  }

  const ratio = asking / totalFairMid;
  if (ratio <= 0.85) {
    return {
      verdict: "CHEAP",
      verdictKo: "👍 저렴해요",
      verdictReason: `${priceLabel}(₩${totalFairMid.toLocaleString()})보다 ${Math.round((1 - ratio) * 100)}% 저렴합니다.`,
    };
  }
  if (ratio <= 1.15) {
    return {
      verdict: "FAIR",
      verdictKo: "✅ 적정가",
      verdictReason:
        analysisMode === "new"
          ? `신품 최저가(₩${totalFairMid.toLocaleString()})와 거의 동일합니다.`
          : `시세(₩${totalFairMid.toLocaleString()})와 거의 동일합니다.`,
    };
  }
  if (ratio <= 1.35) {
    return {
      verdict: "OVERPRICED",
      verdictKo: "⚠️ 약간 비쌈 (네고 여지 있음)",
      verdictReason: `${priceLabel}보다 ${Math.round((ratio - 1) * 100)}% 높습니다. 흥정 여지 있음.`,
    };
  }
  return {
    verdict: "WAY_OVERPRICED",
    verdictKo: "❌ 많이 비쌈",
    verdictReason: `${priceLabel}(₩${totalFairMid.toLocaleString()})보다 ${Math.round((ratio - 1) * 100)}% 높습니다.`,
  };
}

async function resolvePartsForNewMode(parts: any[]): Promise<AnalyzedPart[]> {
  const resolvedParts: AnalyzedPart[] = [];

  for (const p of parts) {
    const partId = await resolvePartId(p.partName, p.category);
    let newPrice: number | null = null;
    let sampleSize = 0;

    if (partId) {
      const dbNew = await resolveNewProductPriceFromDb(partId, p.partName, p.category);
      if (dbNew) {
        newPrice = dbNew.price;
        sampleSize = dbNew.sampleSize;
      }
    }

    if (newPrice) {
      resolvedParts.push(
        attachNewModePriceSource(
          {
            ...p,
            partId,
            approximated: false,
            usedLow: newPrice,
            usedMid: newPrice,
            usedHigh: Math.round(newPrice * 1.05),
            newPrice,
            sampleSize,
          },
          "db",
        ),
      );
    } else {
      const estimate = parseExtractedEstimates(p);
      const fallbackNew = estimate?.newPrice ?? null;

      if (
        fallbackNew &&
        isValidNewPrice(fallbackNew, p.partName, p.category) &&
        isSanePriceForCategory(fallbackNew, p.category)
      ) {
        resolvedParts.push(
          attachNewModePriceSource(
            {
              ...p,
              partId,
              approximated: false,
              usedLow: fallbackNew,
              usedMid: fallbackNew,
              usedHigh: Math.round(fallbackNew * 1.05),
              newPrice: fallbackNew,
              sampleSize: 0,
            },
            "ai",
          ),
        );
      } else {
        resolvedParts.push({
          ...p,
          partId,
          approximated: false,
          usedLow: null,
          usedMid: null,
          usedHigh: null,
          newPrice: null,
          priceSource: "new",
          priceSourceLabel: "신품 최저가",
          sampleSize: 0,
        });
      }
    }
  }

  return resolvedParts;
}

// ── Claude 호출 헬퍼 ─────────────────────────────────────
async function callClaude(system: string, user: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

type ExtractedListing = { askingPrice: number | null; parts: any[] };

type ResolvePricesOutput = {
  parts: AnalyzedPart[];
  autoCreatedPartIds: Set<string>;
  excludedCount: number;
  droppedRam: AnalyzedPart[];
  preFilterParts: AnalyzedPart[];
};

async function extractParts(text: string): Promise<ExtractedListing> {
  try {
    const extracted = await extractListingFromText(text);
    if (!extracted.parts?.length) {
      throw new Error("인식된 부품이 없습니다.");
    }
    return extracted;
  } catch (error) {
    if (error instanceof Error && error.message === "인식된 부품이 없습니다.") {
      throw error;
    }
    throw new Error("부품 추출 실패. 더 자세한 매물 정보를 입력해주세요.");
  }
}

async function resolvePrices(
  extracted: ExtractedListing,
  analysisMode: AnalyzeResult["analysisMode"],
): Promise<ResolvePricesOutput> {
  if (analysisMode === "new") {
    const parts = await resolvePartsForNewMode(extracted.parts);
    return {
      parts,
      autoCreatedPartIds: new Set<string>(),
      excludedCount: 0,
      droppedRam: [],
      preFilterParts: parts,
    };
  }

  const resolvedParts: AnalyzedPart[] = [];
  const autoCreatedPartIds = new Set<string>();

  for (const p of extracted.parts) {
    let partId = await resolvePartId(p.partName, p.category);

    if (!partId) {
      const createdPartId = await ensurePartForUnmatched(p.partName, p.category);
      if (createdPartId) {
        partId = createdPartId;
        autoCreatedPartIds.add(createdPartId);
      }
    }

    if (partId) {
      const dbPrice = await resolveUsedPriceFromDb(partId, p.partName, p.category);

      if (dbPrice) {
        resolvedParts.push(
          attachPriceSource(
            {
              ...p,
              partId,
              approximated: false,
              usedLow: dbPrice.usedLow,
              usedMid: dbPrice.usedMid,
              usedHigh: dbPrice.usedHigh,
              newPrice: dbPrice.newPrice,
              sampleSize: dbPrice.sampleSize,
              buyoutBasedLow: dbPrice.buyoutBasedLow,
            },
            "db",
          ),
        );
        continue;
      }
    }

    resolvedParts.push(
      attachPriceSource(
        {
          ...p,
          partId,
          approximated: false,
          usedLow: null,
          usedMid: null,
          usedHigh: null,
          newPrice: null,
          sampleSize: 0,
        },
        "ai",
      ),
    );
  }

  for (let i = 0; i < resolvedParts.length; i += 1) {
    const part = resolvedParts[i];
    if (part.category !== "RAM" || part.usedMid !== null) continue;

    const ramPartId = part.partId ?? (await findRamPartId(part.partName));
    if (!ramPartId) continue;

    const dbPrice = await resolveUsedPriceFromDb(ramPartId, part.partName, part.category);
    if (!dbPrice) continue;

    resolvedParts[i] = attachPriceSource(
      {
        ...part,
        partId: ramPartId,
        approximated: false,
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

  for (let i = 0; i < resolvedParts.length; i += 1) {
    const part = resolvedParts[i];
    if (part.usedMid !== null) continue;

    const approx = await resolveApproximatePrice(part.partName, part.category);
    if (!approx) continue;

    resolvedParts[i] = attachPriceSource(
      {
        ...part,
        partId: approx.partId,
        partName: `${part.partName} (유사 부품 기준)`,
        approximated: true,
        usedLow: approx.usedLow,
        usedMid: approx.usedMid,
        usedHigh: approx.usedHigh,
        newPrice: approx.newPrice,
        sampleSize: approx.sampleSize,
        buyoutBasedLow: approx.buyoutBasedLow,
      },
      "db",
    );
  }

  return {
    parts: resolvedParts,
    autoCreatedPartIds,
    excludedCount: 0,
    droppedRam: [],
    preFilterParts: resolvedParts,
  };
}

function summarizeTotals(parts: AnalyzedPart[]) {
  const validParts = parts.filter((part) => part.usedMid);
  return {
    totalFairLow: validParts.reduce((sum, part) => sum + (part.usedLow ?? part.usedMid ?? 0), 0),
    totalFairMid: validParts.reduce((sum, part) => sum + (part.usedMid ?? 0), 0),
    totalFairHigh: validParts.reduce(
      (sum, part) => sum + (part.usedHigh ?? part.usedMid ?? 0),
      0,
    ),
    totalSampleSize: parts.reduce((sum, part) => sum + (part.sampleSize ?? 0), 0),
  };
}

async function calculateResult(
  extracted: ExtractedListing,
  resolved: ResolvePricesOutput,
  analysisMode: AnalyzeResult["analysisMode"],
): Promise<AnalyzeResult> {
  const asking = extracted.askingPrice;
  const warnings: string[] = [];
  const { warnings: missingPartWarnings, missingPartsWarning } = buildMissingPartsWarnings(
    extracted.parts,
  );
  warnings.push(...missingPartWarnings);

  if (analysisMode === "new") {
    const finalParts = resolved.parts;
    const pricedParts = finalParts.filter((part) => part.usedMid !== null && part.usedMid > 0);
    const totals = summarizeTotals(finalParts);
    const { verdict, verdictKo, verdictReason } = buildVerdict(asking, totals.totalFairMid, "new");
    const missingNewPriceCount = finalParts.filter((part) => !part.usedMid).length;
    if (missingNewPriceCount > 0) {
      warnings.push(`${missingNewPriceCount}개 부품은 신품가 정보가 없습니다.`);
    }

    return {
      parts: finalParts,
      askingPrice: asking,
      ...totals,
      verdict,
      verdictKo,
      verdictReason,
      warnings,
      missingPartsWarning,
      analysisMode,
      analysisModeLabel: ANALYSIS_MODE_LABEL.new,
    };
  }

  const resolvedParts = [...resolved.parts];

  for (let i = 0; i < resolvedParts.length; i += 1) {
    const part = resolvedParts[i];
    if (part.usedMid !== null) continue;

    if (part.category === "GPU") {
      const formula = await resolveGpuReferenceFormulaPrice(part);
      if (!formula) continue;

      resolvedParts[i] = attachPriceSource(
        {
          ...part,
          approximated: true,
          usedLow: formula.usedLow,
          usedMid: formula.usedMid,
          usedHigh: formula.usedHigh,
          newPrice: formula.newPrice,
          sampleSize: 0,
        },
        "formula",
      );
      continue;
    }

    if (part.category === "CPU") {
      const formula = await resolveCpuReferenceFormulaPrice(part);
      if (!formula) continue;

      resolvedParts[i] = attachPriceSource(
        {
          ...part,
          approximated: true,
          usedLow: formula.usedLow,
          usedMid: formula.usedMid,
          usedHigh: formula.usedHigh,
          newPrice: formula.newPrice,
          sampleSize: 0,
        },
        "formula",
      );
      continue;
    }

    if (!part.partId) continue;

    const formula = await resolveFormulaPriceFromNewProduct(
      part.partId,
      part.partName,
      part.category,
    );
    if (!formula) continue;

    resolvedParts[i] = attachPriceSource(
      {
        ...part,
        approximated: true,
        usedLow: formula.usedLow,
        usedMid: formula.usedMid,
        usedHigh: formula.usedHigh,
        newPrice: formula.newPrice,
        sampleSize: 0,
      },
      "formula",
    );
  }

  applyExtractedEstimatesToResolved(resolvedParts, extracted.parts);

  for (const part of resolvedParts) {
    if (!part.partId || !resolved.autoCreatedPartIds.has(part.partId)) continue;
    if (part.priceSource !== "ai" || !part.usedMid || part.usedMid <= 0) continue;
    try {
      await saveAiEstimatedBandSnapshots(
        part.partId,
        part.partName,
        part.category,
        part.condition,
        part.usedLow,
        part.usedMid,
        part.usedHigh,
      );
    } catch (error) {
      console.error("AI_ESTIMATED 저장 실패:", error);
    }
  }

  const missingSystemParts = missingSystemPartCategories(extracted.parts);
  if (missingSystemParts.length > 0) {
    try {
      const estimatedParts = await estimateMissingSystemParts(extracted.parts, missingSystemParts);
      resolvedParts.push(...estimatedParts);
    } catch (error) {
      console.error("시스템 부품 추정 실패:", error);
    }
  }

  for (let i = 0; i < resolvedParts.length; i += 1) {
    resolvedParts[i] = await resolveRamPriceFallback(resolvedParts[i]);
  }

  const excludedCount = resolvedParts.filter(
    (part) =>
      part.priceSource === "ai" &&
      (!part.usedMid || part.usedMid <= 0) &&
      part.category !== "RAM",
  ).length;
  const droppedRam = resolvedParts.filter(
    (part) =>
      part.category === "RAM" &&
      part.priceSource === "ai" &&
      (!part.usedMid || part.usedMid <= 0),
  );
  const finalParts = resolvedParts.filter(
    (part) =>
      part.category === "RAM" ||
      !(part.priceSource === "ai" && (!part.usedMid || part.usedMid <= 0)),
  );

  const totals = summarizeTotals(finalParts);
  const { verdict, verdictKo, verdictReason } = buildVerdict(asking, totals.totalFairMid, "used");

  const aiCount = finalParts.filter((part) => part.priceSource === "ai").length;
  const formulaCount = finalParts.filter((part) => part.priceSource === "formula").length;
  if (formulaCount > 0) {
    warnings.push(`${formulaCount}개 부품은 신품가 기반으로 추정했습니다.`);
  }
  if (aiCount > 0) warnings.push(`${aiCount}개 부품은 AI 추정가를 사용했습니다.`);
  if (excludedCount > 0) {
    warnings.push(`${excludedCount}개 부품은 추정 실패로 결과에서 제외했습니다.`);
  }
  if (droppedRam.length > 0) {
    warnings.push(
      `RAM(${droppedRam.map((part) => part.partName).join(", ")}) 시세 조회 실패로 제외됐습니다.`,
    );
  }
  if (finalParts.some((part) => !part.usedMid)) {
    warnings.push("일부 부품의 시세를 찾지 못했습니다.");
  }

  return {
    parts: finalParts,
    askingPrice: asking,
    ...totals,
    verdict,
    verdictKo,
    verdictReason,
    warnings,
    missingPartsWarning,
    analysisMode: "used",
    analysisModeLabel: ANALYSIS_MODE_LABEL.used,
  };
}

async function validatePrices(
  result: AnalyzeResult,
  analysisMode: AnalyzeResult["analysisMode"],
): Promise<AnalyzeResult> {
  const cross = await crossValidateParts(result.parts);
  const claudeValidation = await validateSuspiciousPartPrices(cross.parts);
  const parts = claudeValidation.parts;
  const totals = summarizeTotals(parts);
  const { verdict, verdictKo, verdictReason } = buildVerdict(
    result.askingPrice,
    totals.totalFairMid,
    analysisMode,
  );

  return {
    ...result,
    parts,
    ...totals,
    verdict,
    verdictKo,
    verdictReason,
    warnings: [...result.warnings, ...cross.warnings, ...claudeValidation.warnings],
  };
}

async function persistAnalysisResult(
  result: AnalyzeResult,
  autoCreatedPartIds: Set<string>,
): Promise<void> {
  if (result.analysisMode === "used") {
    try {
      for (const part of result.parts) {
        if (!part.partId || !part.usedMid) continue;
        if (autoCreatedPartIds.has(part.partId) && part.priceSource === "ai") continue;
        if (part.priceSource === "formula") continue;
        if (part.priceSource === "validated") continue;
        if (!shouldPersistUsedPrice(part.usedMid, part.partName, part.category)) continue;
        const range = priceRangeByCategory(part.category);
        if (part.usedMid < range.min || part.usedMid > range.max) continue;
        if (!isSanePriceForCategory(part.usedMid, part.category)) continue;
        await prisma.priceSnapshot.create({
          data: {
            partId: part.partId,
            sourceType: (part.priceSource === "ai" ? "AI_ESTIMATED" : "MANUAL") as any,
            priceKrw: part.usedMid,
            condition: (part.condition ?? "GOOD") as any,
            rawText: JSON.stringify({
              source: "auto-analyze",
              method: part.priceSource,
              label: part.priceSourceLabel,
            }),
          },
        });
      }
    } catch (error) {
      console.error("저장 실패:", error);
    }
  }

  await prisma.valuationRun.create({
    data: {
      runType: "BUYER_CHECK" as any,
      totalFairMid: result.totalFairMid,
      totalFairLow: result.totalFairLow,
      totalFairHigh: result.totalFairHigh,
      askingPriceKrw: result.askingPrice,
      verdict: result.verdict,
    },
  });
}

export async function POST(req: NextRequest) {
  const { text, mode: rawMode } = await req.json();
  const analysisMode: AnalyzeResult["analysisMode"] = rawMode === "new" ? "new" : "used";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
      };

      try {
        if (!text?.trim()) {
          send({ error: "텍스트를 입력해주세요." });
          return;
        }

        send({ pct: 10, step: "extract", message: "부품 추출 중..." });
        const extracted = await extractParts(text.trim());
        send({ pct: 25, step: "extract", message: "부품 추출 완료" });

        send({ pct: 30, step: "db", message: "DB 시세 조회 중..." });
        const resolved = await resolvePrices(extracted, analysisMode);
        send({ pct: 60, step: "db", message: "DB 조회 완료" });

        send({ pct: 70, step: "calc", message: "적정가 계산 중..." });
        const calculated = await calculateResult(extracted, resolved, analysisMode);
        send({ pct: 85, step: "calc", message: "계산 완료" });

        send({ pct: 90, step: "validate", message: "가격 검증 중..." });
        const validated = await validatePrices(calculated, analysisMode);
        await persistAnalysisResult(validated, resolved.autoCreatedPartIds);
        send({ pct: 100, step: "done", message: "분석 완료", result: validated });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.";
        send({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
