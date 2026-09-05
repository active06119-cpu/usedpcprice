#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "src/lib/analyze/pipeline.ts"


def replace_once(src: str, old: str, new: str, label: str) -> str:
    if old not in src:
        raise SystemExit(f"block not found: {label}")
    return src.replace(old, new, 1)


def main() -> None:
    text = PIPELINE.read_text(encoding="utf-8")
    if "findPartIdByAliases" in text:
        print("already patched")
        return

    text = text.replace(
        'import { validateAndCleanPrices } from "@/lib/engine/price-validator";\n',
        'import { validateAndCleanPrices } from "@/lib/engine/price-validator";\n'
        'import { aliasesCompatible } from "@/lib/ingest/part-alias";\n'
        'import { findPartIdByAliases, persistGeneratedAliases } from "@/lib/ingest/part-match";\n',
        1,
    )

    text = replace_once(
        text,
        '  return name\n    .replace(/\\b(TI|SUPER|OC|LHR)\\b/gi, "")\n    .replace(/\\s+/g, " ")\n    .trim();\n',
        '  // TI/SUPER are different SKUs; do not strip them.\n  return name.replace(/\\s+/g, " ").trim();\n',
        "buildApproxKeyword body",
    )

    text = replace_once(
        text,
        '  const similarPart = await prisma.part.findFirst({\n    where: {\n      category: category as any,\n      OR: [\n        { fullName: { contains: keyword, mode: "insensitive" } },\n        { modelName: { contains: keyword, mode: "insensitive" } },\n      ],\n    },\n    select: { id: true },\n  });\n  if (!similarPart) return null;\n',
        '  const similarParts = await prisma.part.findMany({\n    where: {\n      category: category as any,\n      isActive: true,\n      OR: [\n        { fullName: { contains: keyword, mode: "insensitive" } },\n        { modelName: { contains: keyword, mode: "insensitive" } },\n      ],\n    },\n    select: { id: true, fullName: true, modelName: true },\n    take: 30,\n  });\n  const similarPart = similarParts.find(\n    (part) => aliasesCompatible(partName, part.fullName) || aliasesCompatible(partName, part.modelName),\n  );\n  if (!similarPart) return null;\n',
        "approx query",
    )

    text = replace_once(
        text,
        '      select: { id: true },\n    });\n    return part.id;\n  } catch (error) {\n    console.error("ensurePartForUnmatched upsert failed:", error);\n',
        '      select: { id: true },\n    });\n    await persistGeneratedAliases(part.id, partName);\n    return part.id;\n  } catch (error) {\n    console.error("ensurePartForUnmatched upsert failed:", error);\n',
        "ensure aliases",
    )

    text = replace_once(
        text,
        'function partNamesMatch(a: string, b: string): boolean {\n  const left = a.toLowerCase();\n  const right = b.toLowerCase();\n  return left.includes(right) || right.includes(left);\n}\n',
        'function partNamesMatch(a: string, b: string): boolean {\n  return aliasesCompatible(a, b);\n}\n',
        "partNamesMatch",
    )

    text = replace_once(
        text,
        '  const aliasRows = await prisma.partAlias.findMany({\n    where: {\n      OR: [\n        { alias: { contains: nameLower } },\n        { alias: { equals: nameLower } },\n      ],\n    },\n    select: { partId: true, alias: true, part: { select: { category: true } } },\n    take: 20,\n  });\n\n  const aliasHit = aliasRows.find(\n    (row) =>\n      row.part.category === cat &&\n      (nameLower.includes(row.alias) || row.alias.includes(nameLower)),\n  );\n  if (aliasHit) return aliasHit.partId;\n\n  const part = await prisma.part.findFirst({\n    where: {\n      category: cat as any,\n      OR: [\n        { fullName: { contains: partName, mode: "insensitive" } },\n        { modelName: { contains: partName, mode: "insensitive" } },\n      ],\n    },\n    select: { id: true },\n  });\n\n  return part?.id ?? null;\n}\n',
        '  return findPartIdByAliases(partName, cat);\n}\n',
        "resolvePartId lookup",
    )

    text = text.replace(
        '  const cat = category.toUpperCase();\n  const nameLower = partName.toLowerCase();\n\n  if (cat === "RAM") {',
        '  const cat = category.toUpperCase();\n\n  if (cat === "RAM") {',
        1,
    )

    PIPELINE.write_text(text, encoding="utf-8")
    print("patched", PIPELINE)


if __name__ == "__main__":
    main()
