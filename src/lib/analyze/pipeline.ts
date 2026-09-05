// 매물 분석 오케스트레이션.

import { prisma } from "@/lib/prisma";

import type { AnalyzedPart, AnalyzeResult } from "./types";
import {
  ANALYSIS_MODE_LABEL,
  attachPriceSource,
  buildMissingPartsWarnings,
  buildVerdict,
  summarizeTotals,
} from "./helpers";
import {
  resolveApproximatePrice,
  resolveCpuReferenceFormulaPrice,
  resolveFormulaPriceFromNewProduct,
  resolveGpuReferenceFormulaPrice,
  resolveRamPriceFallback,
  resolveUsedPriceFromDb,
} from "./prices";
import {
  applyExtractedEstimatesToResolved,
  estimateMissingSystemParts,
  extractListingFromText,
  findRamPartId,
  missingSystemPartCategories,
  normalizeExtractedParts,
  resolveOneExtractedPart,
  resolvePartsForNewMode,
  supplementRamPartsFromText,
} from "./parts";
import { crossValidateParts, validatePartPricesWithCode, validateRarePartsWithClaude } from "./validate";

export type ExtractedListing = { askingPrice: number | null; parts: any[] };

export type ResolvePricesOutput = {
  parts: AnalyzedPart[];
  autoCreatedPartIds: Set<string>;
  excludedCount: number;
  droppedRam: AnalyzedPart[];
  preFilterParts: AnalyzedPart[];
};

export async function extractParts(text: string): Promise<ExtractedListing> {
  try {
    const extracted = await extractListingFromText(text);
    if (!extracted.parts?.length) {
      throw new Error("NO_PARTS_RECOGNIZED");
    }
    return extracted;
  } catch (error) {
    console.error("[extractParts]", error);

    if (error instanceof Error) {
      if (error.message === "NO_PARTS_RECOGNIZED") {
        throw new Error("인식된 부품이 없습니다.");
      }
      if (error.message === "ANTHROPIC_API_KEY_MISSING") {
        throw new Error("분석 API 키가 설정되지 않았습니다. 관리자에게 문의해주세요.");
      }
      if (error.message.startsWith("CLAUDE_API_ERROR:")) {
        throw new Error("AI 분석 서비스에 일시적인 오류가 있습니다. 잠시 후 다시 시도해주세요.");
      }
      if (error.message === "CLAUDE_EMPTY_RESPONSE" || error.message === "EXTRACTION_JSON_NOT_FOUND") {
        throw new Error("부품 추출 실패. 더 자세한 매물 정보를 입력해주세요.");
      }
    }

    throw new Error("부품 추출 실패. 더 자세한 매물 정보를 입력해주세요.");
  }
}


export async function resolvePrices(
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

  const autoCreatedPartIds = new Set<string>();

  let resolvedParts = await Promise.all(
    extracted.parts.map((p) => resolveOneExtractedPart(p, autoCreatedPartIds)),
  );

  resolvedParts = await Promise.all(
    resolvedParts.map(async (part) => {
      if (part.category !== "RAM" || part.usedMid !== null) return part;

      const ramPartId = part.partId ?? (await findRamPartId(part.partName));
      if (!ramPartId) return part;

      const dbPrice = await resolveUsedPriceFromDb(ramPartId, part.partName, part.category);
      if (!dbPrice) return part;

      return attachPriceSource(
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
    }),
  );

  resolvedParts = await Promise.all(
    resolvedParts.map(async (part) => {
      if (part.usedMid !== null) return part;

      const approx = await resolveApproximatePrice(part.partName, part.category);
      if (!approx) return part;

      return attachPriceSource(
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
    }),
  );

  return {
    parts: resolvedParts,
    autoCreatedPartIds,
    excludedCount: 0,
    droppedRam: [],
    preFilterParts: resolvedParts,
  };
}


export async function calculateResult(
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

export async function validatePrices(
  result: AnalyzeResult,
  analysisMode: AnalyzeResult["analysisMode"],
): Promise<AnalyzeResult> {
  const cross = await crossValidateParts(result.parts);
  const codeValidated =
    analysisMode === "used"
      ? await validatePartPricesWithCode(cross.parts)
      : { parts: cross.parts, warnings: [] as string[] };
  const rareValidated =
    analysisMode === "used"
      ? await validateRarePartsWithClaude(codeValidated.parts)
      : { parts: codeValidated.parts, warnings: [] as string[] };
  const parts = rareValidated.parts;
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
    warnings: [
      ...result.warnings,
      ...cross.warnings,
      ...codeValidated.warnings,
      ...rareValidated.warnings,
    ],
  };
}

export async function persistAnalysisResult(result: AnalyzeResult): Promise<void> {
  // 분석 결과를 price_snapshots에 자동 저장하지 않음 (AI/추정치 DB 오염 방지)
  await prisma.valuationRun
    .create({
      data: {
        runType: "BUYER_CHECK" as any,
        totalFairMid: result.totalFairMid,
        totalFairLow: result.totalFairLow,
        totalFairHigh: result.totalFairHigh,
        askingPriceKrw: result.askingPrice,
        verdict: result.verdict,
      },
    })
    .catch((error) => {
      console.error("ValuationRun 저장 실패:", error);
    });
}
