// 분석 파이프라인 공통 유틸.

import type { AnalyzedPart, AnalyzeResult } from "./types";

export function buildMissingPartsWarnings(extractedParts: { category: string }[]): {
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

export function extractBrandName(partName: string): string {
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

export function categoryKeyword(category: string): string {
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

export function minNewPriceByCategory(category: string): number {
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

export function usedPriceMultiplierByCondition(condition: string | null | undefined): number {
  const normalized = (condition ?? "GOOD").toUpperCase();
  if (normalized === "NEW" || normalized === "LIKE_NEW") return 0.9;
  if (normalized === "GOOD") return 0.7;
  if (normalized === "FAIR") return 0.55;
  return 0.7;
}

export function isSanePriceForCategory(priceKrw: number, category: string): boolean {
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

export function priceSourceLabelFor(source: AnalyzedPart["priceSource"]): string {
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

export function attachNewModePriceSource<T extends Omit<AnalyzedPart, "priceSourceLabel" | "priceSource">>(
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

export function attachPriceSource<T extends Omit<AnalyzedPart, "priceSourceLabel" | "priceSource">>(
  part: T,
  source: AnalyzedPart["priceSource"],
): AnalyzedPart {
  return { ...part, priceSource: source, priceSourceLabel: priceSourceLabelFor(source) };
}


export const ANALYSIS_MODE_LABEL: Record<AnalyzeResult["analysisMode"], string> = {
  used: "중고 시세 기준",
  new: "신품가 기준",
};

export function buildVerdict(
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


export function summarizeTotals(parts: AnalyzedPart[]) {
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

