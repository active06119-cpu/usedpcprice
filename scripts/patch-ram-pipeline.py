#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"{label}: pattern not found in {path}")
    path.write_text(text.replace(old, new, 1))
    print("patched", label)


replace_once(
    ROOT / "src/lib/analyze/parts.ts",
    """import { findPartIdByAliases, persistGeneratedAliases } from \"@/lib/ingest/part-match\";\nimport { aliasesCompatible } from \"@/lib/ingest/part-alias\";\n""",
    """import { findPartIdByAliases, persistGeneratedAliases } from \"@/lib/ingest/part-match\";\nimport { aliasesCompatible } from \"@/lib/ingest/part-alias\";\nimport { pickBestRamPartId, ramPartKey as ramSpecKey } from \"@/lib/ingest/ram-match\";\nimport { isValidNewPrice } from \"@/lib/engine/pricing\";\n""",
    "parts imports",
)
