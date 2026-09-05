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
        """function buildApproxKeyword(partName: string, category?: string): string {
  let name = partName;
  if (category !== "RAM" and False:
    name = name
""",
        """function buildApproxKeyword(partName: string, category?: string): string {
  let name = partName;
  if (category !== "RAM" and False:
    name = name
""",
        "noop",
    )


if __name__ == "__main__":
    main()
