// 부품 추출·카탈로그 매칭.

import { prisma } from "@/lib/prisma";
import { findPartIdByAliases, persistGeneratedAliases } from "@/lib/ingest/part-match";
import { aliasesCompatible } from "@/lib/ingest/part-alias";
import { pickBestRamPartId, ramPartKey } from "@/lib/ingest/ram-match";
import { isValidNewPrice } from "@/lib/engine/pricing";

import { callClaude } from "./claude";
import type { AnalyzedPart } from "./types";
import {
  attachNewModePriceSource,
  attachPriceSource,
  categoryKeyword,
  extractBrandName,
  isSanePriceForCategory,
} from "./helpers";
import { resolveNewProductPriceFromDb, resolveUsedPriceFromDb } from "./prices";

export const SYSTEM_PART_CATEGORIES = ["MOTHERBOARD", "PSU", "CASE"] as const;

export function missingSystemPartCategories(parts: { category: string }[]): string[] {
  const categories = new Set(parts.map((part) => String(part.category).toUpperCase()));
  if (!categories.has("GPU") || !categories.has("CPU")) return [];

  return SYSTEM_PART_CATEGORIES.filter((category) => !categories.has(category));
}

export function normalizeSystemPartCategory(raw: string): string | null {
  const value = raw.toUpperCase();
  if (value === "MOTHERBOARD" || value === "MAINBOARD" || value.includes("BOARD")) return "MOTHERBOARD";
  if (value === "PSU" || value.includes("POWER")) return "PSU";
  if (value === "CASE") return "CASE";
  return null;
}

export function withEstimateLabel(partName: string): string {
  const trimmed = partName.trim();
  if (trimmed.includes("(추정)")) return trimmed;
  return `${trimmed} (추정)`;
}

export async function estimateMissingSystemParts(
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


export async function ensurePartForUnmatched(partName: string, category: string): Promise<string | null> {
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
    await persistGeneratedAliases(part.id, partName);
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


export const EXTRACT_SYSTEM = `
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

export function parseExtractResponse(raw: string): { askingPrice?: number | null; parts?: unknown[] } {
  const cleaned = raw.replace(/```json|```/g, "").trim();

  const tryParse = (payload: string) => {
    try {
      return JSON.parse(payload) as { askingPrice?: number | null; parts?: unknown[] };
    } catch {
      return null;
    }
  };

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const parsed = tryParse(objectMatch[0]);
    if (parsed) return parsed;
  }

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const parsed = tryParse(arrayMatch[0]);
    if (Array.isArray(parsed)) return { parts: parsed };
  }

  throw new Error("EXTRACTION_JSON_NOT_FOUND");
}

export const VALID_PART_CATEGORIES = new Set([
  "GPU",
  "CPU",
  "RAM",
  "SSD",
  "HDD",
  "MOTHERBOARD",
  "PSU",
  "CASE",
  "COOLER",
]);

export async function extractListingFromText(text: string): Promise<{ askingPrice: number | null; parts: any[] }> {
  const raw = await callClaude(EXTRACT_SYSTEM, text);
  const parsed = parseExtractResponse(raw);
  const normalized = normalizeExtractedParts(Array.isArray(parsed.parts) ? parsed.parts : []);
  const parts = supplementRamPartsFromText(text, normalized);

  return {
    askingPrice: typeof parsed.askingPrice === "number" ? parsed.askingPrice : null,
    parts,
  };
}

export function parseOptionalEstimate(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function partNamesMatch(a: string, b: string): boolean {
  return aliasesCompatible(a, b);
}

export function parseExtractedEstimates(part: {
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

export function applyExtractedEstimatesToResolved(
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

export function normalizeExtractedParts(parts: any[]): any[] {
  return parts
    .map((part) => {
      const rawCategory = String(part.category ?? "").toUpperCase();
      const category =
        rawCategory === "MEMORY" || rawCategory === "MEM" || rawCategory === "메모리"
          ? "RAM"
          : rawCategory;

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
    })
    .filter((part) => part.partName.length > 0 && VALID_PART_CATEGORIES.has(part.category));
}

export { ramPartKey };

/** SSD/NVMe 문맥의 용량만 제외. DDR4 16GB 옆에 SSD가 있어도 RAM으로 인식 */
export function shouldSkipRamMatch(matchText: string, text: string, index: number, matchLength: number): boolean {
  if (/ddr[45]/i.test(matchText)) return false;
  if (/(램|ram|memory|메모리)/i.test(matchText)) return false;

  const ctx = text.slice(Math.max(0, index - 16), index + matchLength + 16).toLowerCase();
  const storageHint = /\b(ssd|nvme|hdd|m\.2)\b/.test(ctx);
  const ramHint = /(ddr4|ddr5|램|ram|memory|메모리)/.test(ctx);
  return storageHint && !ramHint;
}

/** AI 추출과 무관하게 매물 본문에서 RAM을 규칙 기반으로 추출·병합 */
export function supplementRamPartsFromText(text: string, parts: any[]): any[] {
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


export async function findRamPartId(partName: string): Promise<string | null> {
  const candidates = await prisma.part.findMany({
    where: { category: "RAM", isActive: true },
    select: { id: true, fullName: true, modelName: true },
  });
  return pickBestRamPartId(partName, candidates);
}

export async function resolvePartId(partName: string, category: string): Promise<string | null> {
  const cat = category.toUpperCase();

  if (cat === "RAM") {
    const ramId = await findRamPartId(partName);
    if (ramId) return ramId;
  }

  return findPartIdByAliases(partName, cat);
}


export async function resolvePartsForNewMode(parts: any[]): Promise<AnalyzedPart[]> {
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



export async function resolveOneExtractedPart(
  p: {
    partName: string;
    category: string;
    condition: string;
    conditionKo: string;
    approximated?: boolean;
  },
  autoCreatedPartIds: Set<string>,
): Promise<AnalyzedPart> {
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
      return attachPriceSource(
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
      );
    }
  }

  return attachPriceSource(
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
  );
}

