// 시세 검증·이상치 보정.

import { validateAndCleanPrices } from "@/lib/engine/price-validator";
import { shouldPersistUsedPrice } from "@/lib/engine/pricing";
import {
  findCpuReferenceNewPrice,
  findGpuReferenceNewPrice,
  getCpuReferencePrice,
  getGpuReferencePrice,
} from "@/lib/engine/gpu-reference-prices";
import { ramPartKey } from "@/lib/ingest/ram-match";

import { callClaude } from "./claude";
import type { AnalyzedPart } from "./types";
import { attachPriceSource, isSanePriceForCategory } from "./helpers";
import { partNamesMatch } from "./parts";
import {
  getBuyoutPrice,
  RAM_STATIC_MID_KRW,
  resolveCpuReferenceFormulaPrice,
  resolveFormulaPriceFromNewProduct,
  resolveGpuReferenceFormulaPrice,
  resolveUsedPriceFromDb,
} from "./prices";

export async function crossValidatePartPrice(
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

export async function crossValidateParts(parts: AnalyzedPart[]): Promise<{
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

export type SuspiciousPartCandidate = {
  index: number;
  partName: string;
  category: string;
  calculatedPrice: number;
  formulaPrice: number | null;
  buyoutPrice: number | null;
  reason: "ai_estimate" | "below_buyout" | "formula_deviation";
};

export type ClaudeValidationResult = {
  partName: string;
  isValid: boolean;
  correctedPrice: number | null;
};

export const SUSPICIOUS_FORMULA_LOW_RATIO = 0.5;
export const SUSPICIOUS_FORMULA_HIGH_RATIO = 2.0;

export function isSuspiciousUsedPrice(
  usedMid: number,
  formulaPrice: number | null,
  buyoutPrice: number | null,
): boolean {
  if (buyoutPrice !== null && buyoutPrice > 0 && usedMid < buyoutPrice) return true;
  if (!formulaPrice || formulaPrice <= 0) return false;
  if (usedMid < formulaPrice * SUSPICIOUS_FORMULA_LOW_RATIO) return true;
  if (usedMid > formulaPrice * SUSPICIOUS_FORMULA_HIGH_RATIO) return true;
  return false;
}

export function getSuspiciousReason(
  part: AnalyzedPart,
  formulaPrice: number | null,
  buyoutPrice: number | null,
): SuspiciousPartCandidate["reason"] | null {
  if (!part.usedMid || part.usedMid <= 0) return null;

  if (buyoutPrice !== null && buyoutPrice > 0 && part.usedMid < buyoutPrice) {
    return "below_buyout";
  }

  if (part.priceSource === "ai") {
    if (!formulaPrice || formulaPrice <= 0) return "ai_estimate";
    if (isSuspiciousUsedPrice(part.usedMid, formulaPrice, null)) return "formula_deviation";
    return null;
  }

  if (part.priceSource === "validated" || part.priceSource === "formula") {
    return null;
  }

  if (isSuspiciousUsedPrice(part.usedMid, formulaPrice, buyoutPrice)) {
    return "formula_deviation";
  }

  return null;
}

export function clampValidatedPrice(
  correctedPrice: number,
  formulaPrice: number | null,
  buyoutPrice: number | null,
): number {
  let price = correctedPrice;

  if (formulaPrice && formulaPrice > 0) {
    const min = Math.round(formulaPrice * SUSPICIOUS_FORMULA_LOW_RATIO);
    const max = Math.round(formulaPrice * SUSPICIOUS_FORMULA_HIGH_RATIO);
    price = Math.max(min, Math.min(max, price));
  }

  if (buyoutPrice && buyoutPrice > 0 && price < buyoutPrice) {
    price = Math.round(buyoutPrice * 1.2);
  }

  return price;
}

export async function resolveReferenceFormulaBand(
  part: AnalyzedPart,
): Promise<{
  usedLow: number;
  usedMid: number;
  usedHigh: number;
  newPrice: number;
} | null> {
  if (part.category === "GPU") {
    return resolveGpuReferenceFormulaPrice(part);
  }
  if (part.category === "CPU") {
    return resolveCpuReferenceFormulaPrice(part);
  }
  if (!part.partId) return null;
  return resolveFormulaPriceFromNewProduct(part.partId, part.partName, part.category);
}

export function suspiciousReasonLabel(reason: SuspiciousPartCandidate["reason"]): string {
  switch (reason) {
    case "ai_estimate":
      return "AI 추정 (참조 시세 없음)";
    case "below_buyout":
      return "매입가보다 낮음";
    case "formula_deviation":
      return "참조 시세 대비 이상";
  }
}

export async function resolveReferenceFormulaMid(part: AnalyzedPart): Promise<number | null> {
  const band = await resolveReferenceFormulaBand(part);
  return band?.usedMid ?? null;
}

export function parseClaudeValidationResults(raw: string): ClaudeValidationResult[] {
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

export async function collectSuspiciousParts(parts: AnalyzedPart[]): Promise<SuspiciousPartCandidate[]> {
  const suspicious: SuspiciousPartCandidate[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part.usedMid || part.usedMid <= 0) continue;

    const formulaPrice = await resolveReferenceFormulaMid(part);
    const buyout = part.partId ? await getBuyoutPrice(part.partId) : null;
    const buyoutPrice = buyout?.priceKrw ?? null;
    const reason = getSuspiciousReason(part, formulaPrice, buyoutPrice);
    if (!reason) continue;

    suspicious.push({
      index: i,
      partName: part.partName,
      category: part.category,
      calculatedPrice: part.usedMid,
      formulaPrice,
      buyoutPrice,
      reason,
    });
  }

  return suspicious;
}

export function buildValidatedPart(
  previous: AnalyzedPart,
  correctedPrice: number,
): AnalyzedPart | null {
  if (!isSanePriceForCategory(correctedPrice, previous.category)) return null;
  if (!shouldPersistUsedPrice(correctedPrice, previous.partName, previous.category)) return null;

  return attachPriceSource(
    {
      ...previous,
      usedMid: correctedPrice,
      usedLow: Math.round(correctedPrice * 0.9),
      usedHigh: Math.round(correctedPrice * 1.1),
      approximated: false,
    },
    "validated",
  );
}

export async function tryFormulaFallback(
  part: AnalyzedPart,
  candidate: SuspiciousPartCandidate,
): Promise<{ part: AnalyzedPart; message: string } | null> {
  const formula = await resolveReferenceFormulaBand(part);
  if (!formula) return null;

  return {
    part: attachPriceSource(
      {
        ...part,
        usedLow: formula.usedLow,
        usedMid: formula.usedMid,
        usedHigh: formula.usedHigh,
        newPrice: formula.newPrice,
        approximated: true,
        sampleSize: 0,
      },
      "formula",
    ),
    message: `${part.partName}: ${suspiciousReasonLabel(candidate.reason)} → 참조 시세(₩${formula.usedMid.toLocaleString()}) 적용`,
  };
}

export async function reconcileUnresolvedSuspiciousParts(
  updated: AnalyzedPart[],
  suspicious: SuspiciousPartCandidate[],
  handledIndices: Set<number>,
): Promise<string[]> {
  const warnings: string[] = [];

  for (const candidate of suspicious) {
    if (handledIndices.has(candidate.index)) continue;

    const part = updated[candidate.index];
    const fallback = await tryFormulaFallback(part, candidate);
    if (fallback) {
      updated[candidate.index] = fallback.part;
      warnings.push(fallback.message);
      continue;
    }

    if (part.priceSource === "ai") {
      warnings.push(`${part.partName}: AI 추정가 유지 (참고용 · 검증 기준 없음)`);
    }
  }

  return warnings;
}

export async function hasReferencePrice(part: AnalyzedPart): Promise<boolean> {
  const category = part.category.toUpperCase();

  if (category === "GPU") {
    return (
      getGpuReferencePrice(part.partName) !== null ||
      findGpuReferenceNewPrice(part.partName) !== null
    );
  }

  if (category === "CPU") {
    return (
      getCpuReferencePrice(part.partName) !== null ||
      findCpuReferenceNewPrice(part.partName) !== null
    );
  }

  if (category === "RAM") {
    if (RAM_STATIC_MID_KRW[ramPartKey(part.partName)]) return true;
    if (!part.partId) return false;
    const dbPrice = await resolveUsedPriceFromDb(part.partId, part.partName, "RAM", 1);
    return dbPrice !== null;
  }

  if (category === "SSD") {
    if (!part.partId) return false;
    const formula = await resolveFormulaPriceFromNewProduct(part.partId, part.partName, "SSD");
    if (formula) return true;
    const dbPrice = await resolveUsedPriceFromDb(part.partId, part.partName, "SSD", 1);
    return dbPrice !== null;
  }

  return true;
}

export async function needsRarePartClaudeReview(part: AnalyzedPart): Promise<boolean> {
  const category = part.category.toUpperCase();
  if (!["GPU", "CPU", "RAM", "SSD"].includes(category)) return false;
  if (!part.usedMid || part.usedMid <= 0) return false;
  if (await hasReferencePrice(part)) return false;

  const buyout = part.partId ? await getBuyoutPrice(part.partId) : null;
  return !(buyout?.priceKrw && buyout.priceKrw > 0);
}

export async function validatePartPricesWithCode(parts: AnalyzedPart[]): Promise<{
  parts: AnalyzedPart[];
  warnings: string[];
}> {
  const updated = parts.map((part) => ({ ...part }));
  const warnings: string[] = [];

  for (let i = 0; i < updated.length; i += 1) {
    const part = updated[i];
    if (!part.usedMid || part.usedMid <= 0 || !part.partId) continue;
    if (part.priceSource !== "db") continue;

    const check = await validateAndCleanPrices(part.partId, part.category, [
      {
        id: `code-validate-${i}`,
        priceKrw: part.usedMid,
        sourceType: "MANUAL",
      },
    ]);

    if (check.valid.length > 0) continue;

    const formulaPrice = await resolveReferenceFormulaMid(part);
    const buyout = await getBuyoutPrice(part.partId);
    const fallback = await tryFormulaFallback(part, {
      index: i,
      partName: part.partName,
      category: part.category,
      calculatedPrice: part.usedMid,
      formulaPrice,
      buyoutPrice: buyout?.priceKrw ?? null,
      reason: "formula_deviation",
    });

    if (fallback) {
      updated[i] = fallback.part;
      warnings.push(`${part.partName}: 코드 검수 보정 (${fallback.message})`);
    }
  }

  const suspicious = await collectSuspiciousParts(updated);
  const handledIndices = new Set<number>();

  for (const candidate of suspicious) {
    if (handledIndices.has(candidate.index)) continue;

    const part = updated[candidate.index];
    const fallback = await tryFormulaFallback(part, candidate);
    if (!fallback) continue;

    updated[candidate.index] = fallback.part;
    handledIndices.add(candidate.index);
    warnings.push(fallback.message);
  }

  warnings.push(...(await reconcileUnresolvedSuspiciousParts(updated, suspicious, handledIndices)));

  return { parts: updated, warnings };
}

export async function validateRarePartsWithClaude(parts: AnalyzedPart[]): Promise<{
  parts: AnalyzedPart[];
  warnings: string[];
}> {
  const candidates: Array<{ index: number; part: AnalyzedPart }> = [];

  for (let i = 0; i < parts.length; i += 1) {
    if (await needsRarePartClaudeReview(parts[i])) {
      candidates.push({ index: i, part: parts[i] });
    }
  }

  if (candidates.length === 0) {
    return { parts, warnings: [] };
  }

  const updated = parts.map((part) => ({ ...part }));
  const warnings: string[] = [];

  const prompt = `다음은 참조 시세표·매입가 데이터가 없는 희귀/구형 PC 부품입니다.
한국 2025년 번개장터·당근마켓 GOOD 상태 기준으로 가격을 검수해줘.

${JSON.stringify(
  candidates.map(({ part }) => ({
    partName: part.partName,
    category: part.category,
    calculatedPrice: part.usedMid,
    condition: part.condition,
  })),
  null,
  2,
)}

각 항목마다 JSON으로:
{ "partName": "...", "isValid": true/false, "correctedPrice": null or 숫자 }

규칙:
- 명백히 비현실적인 가격만 correctedPrice 제시
- 확실하지 않으면 isValid: true, correctedPrice: null
- JSON 배열만 반환`;

  try {
    const raw = await callClaude(
      "너는 한국 중고 PC 희귀 부품 시세 전문가야. 요청된 JSON 배열만 반환해.",
      prompt,
    );
    const results = parseClaudeValidationResults(raw);

    for (const result of results) {
      if (result.isValid !== false || result.correctedPrice === null) continue;

      const candidate =
        candidates.find((item) => partNamesMatch(item.part.partName, result.partName)) ??
        candidates.find((item) => item.part.partName === result.partName);
      if (!candidate) continue;

      const previous = updated[candidate.index];
      if (!previous.usedMid) continue;

      const clamped = clampValidatedPrice(result.correctedPrice, null, null);
      const nextPart = buildValidatedPart(previous, clamped);
      if (!nextPart) continue;

      updated[candidate.index] = nextPart;
      warnings.push(
        `${previous.partName}: 희귀 부품 AI 검수 보정 (₩${previous.usedMid.toLocaleString()} → ₩${clamped.toLocaleString()})`,
      );
    }
  } catch (error) {
    console.error("희귀 부품 Claude 검수 실패:", error);
    warnings.push("희귀 부품 AI 검수를 건너뛰었습니다.");
  }

  for (const { index, part } of candidates) {
    if (updated[index].priceSource === "validated") continue;
    if (part.priceSource === "ai") {
      warnings.push(`${part.partName}: AI 추정가 유지 (참고용 · 검증 기준 없음)`);
    }
  }

  return { parts: updated, warnings };
}

