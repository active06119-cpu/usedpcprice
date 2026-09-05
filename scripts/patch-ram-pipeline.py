#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if old not in text:
        if new in text:
            print("already patched", label)
            return
        raise SystemExit(f"{label}: pattern not found in {path}")
    path.write_text(text.replace(old, new, 1))
    print("patched", label)


parts = ROOT / "src/lib/analyze/parts.ts"
replace_once(
    parts,
    'import { pickBestRamPartId, ramPartKey as ramSpecKey } from "@/lib/ingest/ram-match";\n',
    'import { pickBestRamPartId, ramPartKey } from "@/lib/ingest/ram-match";\n',
    "parts ram import",
)
replace_once(
    parts,
    """  extractBrandName,
  isSanePriceForCategory,
  minNewPriceByCategory,
} from "./helpers";
import {
  applyReferenceNewPrice,
  getNewPrice,
  resolveApproximatePrice,
  resolveUsedPriceFromDb,
} from "./prices";
""",
    """  extractBrandName,
  isSanePriceForCategory,
} from "./helpers";
import { resolveNewProductPriceFromDb, resolveUsedPriceFromDb } from "./prices";
""",
    "parts helper/price imports",
)
replace_once(
    parts,
    """export function ramPartKey(partName: string): string {
  const lower = partName.toLowerCase();
  const gen = /\\bddr5\\b/.test(lower) ? "ddr5" : "ddr4";
  const cap = lower.match(/(\\d+)\\s*(?:gb|g)\\b/)?.[1] ?? lower.match(/\\b(\\d{1,3})\\b/)?.[1] ?? "";
  return `${gen}:${cap}`;
}
""",
    "export { ramPartKey };\n",
    "parts ramPartKey reexport",
)
replace_once(
    parts,
    """export async function findRamPartId(partName: string): Promise<string | null> {
  const lower = partName.toLowerCase();
  const ddr = /\\bddr5\\b/.test(lower) ? "DDR5" : /\\bddr4\\b/.test(lower) ? "DDR4" : null;
  const capMatch = lower.match(/\\b(\\d+)\\s*(?:gb|g)\\b/) ?? lower.match(/\\b(\\d+)\\b/);
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
""",
    """export async function findRamPartId(partName: string): Promise<string | null> {
  const candidates = await prisma.part.findMany({
    where: { category: "RAM", isActive: true },
    select: { id: true, fullName: true, modelName: true },
  });
  return pickBestRamPartId(partName, candidates);
}
""",
    "parts findRamPartId",
)

replace_once(
    ROOT / "src/lib/analyze/pipeline.ts",
    """  findRamPartId,
  missingSystemPartCategories,
  normalizeExtractedParts,
  resolveOneExtractedPart,
  resolvePartsForNewMode,
  supplementRamPartsFromText,
} from "./parts";
""",
    """  findRamPartId,
  missingSystemPartCategories,
  resolveOneExtractedPart,
  resolvePartsForNewMode,
} from "./parts";
""",
    "pipeline unused imports",
)

replace_once(
    ROOT / "src/lib/analyze/prices.ts",
    'import { aliasesCompatible } from "@/lib/ingest/part-alias";\n',
    'import { aliasesCompatible } from "@/lib/ingest/part-alias";\nimport { ramPartKey } from "@/lib/ingest/ram-match";\n',
    "prices ramPartKey import",
)
replace_once(
    ROOT / "src/lib/analyze/prices.ts",
    """import {
  attachPriceSource,
  isSanePriceForCategory,
  usedPriceMultiplierByCondition,
} from "./helpers";
""",
    """import {
  attachPriceSource,
  categoryKeyword,
  isSanePriceForCategory,
  usedPriceMultiplierByCondition,
} from "./helpers";
""",
    "prices categoryKeyword import",
)
replace_once(
    ROOT / "src/lib/analyze/prices.ts",
    "  const ramPartId = part.partId ?? (await findRamPartId(part.partName));\n",
    "  const ramPartId =\n    part.partId ?? (await (await import(\"./parts\")).findRamPartId(part.partName));\n",
    "prices dynamic findRamPartId",
)

replace_once(
    ROOT / "src/lib/analyze/validate.ts",
    """import { validateAndCleanPrices } from "@/lib/engine/price-validator";

import { callClaude } from "./claude";
import type { AnalyzedPart } from "./types";
import { attachPriceSource, isSanePriceForCategory } from "./helpers";
import {
  getBuyoutPrice,
  resolveCpuReferenceFormulaPrice,
  resolveFormulaPriceFromNewProduct,
  resolveGpuReferenceFormulaPrice,
  resolveNewProductPriceFromDb,
} from "./prices";
""",
    """import { validateAndCleanPrices } from "@/lib/engine/price-validator";
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
""",
    "validate imports",
)
