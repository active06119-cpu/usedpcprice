#!/usr/bin/env python3
"""Split src/lib/analyze/pipeline.ts into helpers/prices/parts/validate + thin pipeline."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/lib/analyze/pipeline.ts"
LIB = ROOT / "src/lib/analyze"


def slice_lines(lines, start, end):
    return "\n".join(lines[start - 1 : end]) + "\n"


def exportize(block):
    out = []
    for line in block.splitlines():
        if line.startswith("export "):
            out.append(line)
        elif line.startswith(("async function ", "function ", "type ")) or (
            line.startswith("const ") and not line.startswith("const {")
        ):
            out.append("export " + line)
        else:
            out.append(line)
    return "\n".join(out) + "\n"


def ensure_export(block, needle):
    exported = "export " + needle
    if exported in block:
        return block
    return block.replace(needle, exported)


def main():
    text = SRC.read_text(encoding="utf-8")
    if 'from "./prices"' in text and "export async function extractParts" in text and text.count("\n") < 400:
        print("already split")
        return

    lines = text.splitlines()

    helpers = exportize(
        slice_lines(lines, 28, 217)
        + "\n"
        + slice_lines(lines, 482, 515)
        + "\n"
        + slice_lines(lines, 1694, 1745)
        + "\n"
        + slice_lines(lines, 1999, 2011)
    )
    prices = exportize(
        slice_lines(lines, 218, 481)
        + "\n"
        + slice_lines(lines, 516, 684)
        + "\n"
        + slice_lines(lines, 1177, 1201)
        + "\n"
        + slice_lines(lines, 1246, 1296)
        + "\n"
        + slice_lines(lines, 1596, 1645)
    )
    parts = exportize(
        slice_lines(lines, 55, 142)
        + "\n"
        + slice_lines(lines, 1202, 1245)
        + "\n"
        + slice_lines(lines, 1297, 1595)
        + "\n"
        + slice_lines(lines, 1646, 1693)
        + "\n"
        + slice_lines(lines, 1746, 1822)
        + "\n"
        + slice_lines(lines, 1862, 1916)
    )
    validate = exportize(slice_lines(lines, 685, 1176))
    orch = (
        slice_lines(lines, 1823, 1861)
        + "\n"
        + slice_lines(lines, 1917, 1998)
        + "\n"
        + slice_lines(lines, 2012, 2237)
    )

    (LIB / "helpers.ts").write_text(
        '// \ubd84\uc11d \ud30c\uc774\ud504\ub77c\uc778 \uacf5\ud1b5 \uc720\ud2f8.\n\nimport type { AnalyzedPart, AnalyzeResult } from "./types";\n\n' + helpers,
        encoding="utf-8",
    )

    (LIB / "prices.ts").write_text(
        '// DB/\uacf5\uc2dd \uc2dc\uc138 \uc870\ud68c.\n\n'
        + 'import { prisma } from "@/lib/prisma";\n'
        + 'import {\n  filterUsedPrices,\n  isMidInValidRange,\n  isValidNewPrice,\n  isValidUsedPrice,\n  shouldPersistUsedPrice,\n} from "@/lib/engine/pricing";\n'
        + 'import { validateAndCleanPrices } from "@/lib/engine/price-validator";\n'
        + 'import {\n  estimateGpuUsedPrice,\n  estimateCpuUsedPrice,\n  findGpuReferenceNewPrice,\n  findCpuReferenceNewPrice,\n  getGpuReferencePrice,\n  getCpuReferencePrice,\n} from "@/lib/engine/gpu-reference-prices";\n'
        + 'import { aliasesCompatible } from "@/lib/ingest/part-alias";\n\n'
        + 'import type { AnalyzedPart } from "./types";\n'
        + 'import {\n  attachPriceSource,\n  isSanePriceForCategory,\n  usedPriceMultiplierByCondition,\n} from "./helpers";\n\n'
        + prices,
        encoding="utf-8",
    )

    (LIB / "parts.ts").write_text(
        '// \ubd80\ud488 \ucd94\ucd9c\u00b7\uce74\ud0c8\ub85c\uadf8 \ub9e4\uce6d.\n\n'
        + 'import { prisma } from "@/lib/prisma";\n'
        + 'import { findPartIdByAliases, persistGeneratedAliases } from "@/lib/ingest/part-match";\n'
        + 'import { aliasesCompatible } from "@/lib/ingest/part-alias";\n\n'
        + 'import { callClaude } from "./claude";\n'
        + 'import type { AnalyzedPart } from "./types";\n'
        + 'import {\n  attachNewModePriceSource,\n  attachPriceSource,\n  categoryKeyword,\n  extractBrandName,\n  isSanePriceForCategory,\n  minNewPriceByCategory,\n} from "./helpers";\n'
        + 'import {\n  applyReferenceNewPrice,\n  getNewPrice,\n  resolveApproximatePrice,\n  resolveUsedPriceFromDb,\n} from "./prices";\n\n'
        + parts,
        encoding="utf-8",
    )

    (LIB / "validate.ts").write_text(
        '// \uc2dc\uc138 \uac80\uc99d\u00b7\uc774\uc0c1\uce58 \ubcf4\uc815.\n\n'
        + 'import { validateAndCleanPrices } from "@/lib/engine/price-validator";\n\n'
        + 'import { callClaude } from "./claude";\n'
        + 'import type { AnalyzedPart } from "./types";\n'
        + 'import { attachPriceSource, isSanePriceForCategory } from "./helpers";\n'
        + 'import {\n  getBuyoutPrice,\n  resolveCpuReferenceFormulaPrice,\n  resolveFormulaPriceFromNewProduct,\n  resolveGpuReferenceFormulaPrice,\n  resolveNewProductPriceFromDb,\n} from "./prices";\n\n'
        + validate,
        encoding="utf-8",
    )

    orch_exp = orch
    for needle in (
        "async function extractParts",
        "async function resolvePrices",
        "async function calculateResult",
        "async function validatePrices",
        "async function persistAnalysisResult",
        "type ExtractedListing",
        "type ResolvePricesOutput",
    ):
        orch_exp = ensure_export(orch_exp, needle)

    SRC.write_text(
        '// \ub9e4\ubb3c \ubd84\uc11d \uc624\ucf00\uc2a4\ud2b8\ub808\uc774\uc158.\n\n'
        + 'import { prisma } from "@/lib/prisma";\n\n'
        + 'import type { AnalyzedPart, AnalyzeResult } from "./types";\n'
        + 'import {\n  ANALYSIS_MODE_LABEL,\n  attachPriceSource,\n  buildMissingPartsWarnings,\n  buildVerdict,\n  summarizeTotals,\n} from "./helpers";\n'
        + 'import {\n  resolveApproximatePrice,\n  resolveCpuReferenceFormulaPrice,\n  resolveFormulaPriceFromNewProduct,\n  resolveGpuReferenceFormulaPrice,\n  resolveRamPriceFallback,\n  resolveUsedPriceFromDb,\n} from "./prices";\n'
        + 'import {\n  applyExtractedEstimatesToResolved,\n  estimateMissingSystemParts,\n  extractListingFromText,\n  findRamPartId,\n  missingSystemPartCategories,\n  normalizeExtractedParts,\n  resolveOneExtractedPart,\n  resolvePartsForNewMode,\n  supplementRamPartsFromText,\n} from "./parts";\n'
        + 'import { crossValidateParts, validatePartPricesWithCode, validateRarePartsWithClaude } from "./validate";\n\n'
        + orch_exp,
        encoding="utf-8",
    )

    (LIB / "index.ts").write_text(
        'export type { AnalyzedPart, AnalyzeResult } from "./types";\n'
        + 'export {\n  extractParts,\n  resolvePrices,\n  calculateResult,\n  validatePrices,\n  persistAnalysisResult,\n} from "./pipeline";\n',
        encoding="utf-8",
    )
    print("split done", SRC.stat().st_size)


if __name__ == "__main__":
    main()
