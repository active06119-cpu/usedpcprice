#!/usr/bin/env python3
"""Split src/app/api/analyze/route.ts into src/lib/analyze modules. Idempotent."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = ROOT / "src/app/api/analyze/route.ts"
LIB = ROOT / "src/lib/analyze"


def find_line(lines: list[str], prefix: str, start: int = 0) -> int:
    for i in range(start, len(lines)):
        if lines[i].startswith(prefix):
            return i
    raise SystemExit(f"marker not found: {prefix!r}")


def main() -> None:
    if not ROUTE.exists():
        raise SystemExit(f"missing {ROUTE}")

    raw = ROUTE.read_text(encoding="utf-8")
    if 'from "@/lib/analyze"' in raw and "export async function POST" in raw and raw.count("\n") < 200:
        print("already split; skipping")
        return

    lines = raw.splitlines()

    iface_part = find_line(lines, "export interface AnalyzedPart")
    body_start = find_line(lines, "function buildMissingPartsWarnings")
    claude_comment = find_line(lines, "// ── Claude")
    call_claude = find_line(lines, "async function callClaude")
    extracted_type = find_line(lines, "type ExtractedListing")
    limit_const = find_line(lines, "const ANALYZE_LIMIT")

    type_block = "\n".join(lines[iface_part:body_start]).strip() + "\n"
    claude_fn = "\n".join(lines[call_claude:extracted_type]).strip() + "\n"
    if claude_fn.startswith("async function callClaude"):
        claude_fn = "export " + claude_fn
    pipeline_body = "\n".join(lines[body_start:claude_comment] + [""] + lines[extracted_type:limit_const]).strip() + "\n"

    LIB.mkdir(parents=True, exist_ok=True)

    (LIB / "types.ts").write_text(
        "// 분석 API 공개 타입. UI/공유 저장이 이 모듈을 사용한다.\n\n" + type_block,
        encoding="utf-8",
    )

    (LIB / "claude.ts").write_text(
        "// Anthropic Messages API 호출. 분석 파이프라인 전용.\n\n" + claude_fn,
        encoding="utf-8",
    )

    pipeline_header = """// 매물 분석 파이프라인 — 추출 → 시세 조회 → 합산 → 검증.
// 기존 /api/analyze/route.ts 본문을 옮긴 것이며 동작은 동일하다.

import { prisma } from \"@/lib/prisma\";
import {
  filterUsedPrices,
  isMidInValidRange,
  isValidNewPrice,
  isValidUsedPrice,
  priceRangeByCategory,
  shouldPersistUsedPrice,
} from \"@/lib/engine/pricing\";
import {
  estimateGpuUsedPrice,
  estimateCpuUsedPrice,
  findGpuReferenceNewPrice,
  findCpuReferenceNewPrice,
  getGpuReferencePrice,
  getCpuReferencePrice,
} from \"@/lib/engine/gpu-reference-prices\";
import { validateAndCleanPrices } from \"@/lib/engine/price-validator\";

import { callClaude } from \"./claude\";
import type { AnalyzedPart, AnalyzeResult } from \"./types\";

"""

    pipeline_exports = pipeline_body
    for name in (
        "async function extractParts",
        "async function resolvePrices",
        "async function calculateResult",
        "async function validatePrices",
        "async function persistAnalysisResult",
    ):
        pipeline_exports = pipeline_exports.replace(name, "export " + name)

    (LIB / "pipeline.ts").write_text(pipeline_header + pipeline_exports, encoding="utf-8")

    (LIB / "index.ts").write_text(
        """export type { AnalyzedPart, AnalyzeResult } from \"./types\";
export {
  extractParts,
  resolvePrices,
  calculateResult,
  validatePrices,
  persistAnalysisResult,
} from \"./pipeline\";
""",
        encoding="utf-8",
    )

    extract = LIB / "extract.ts"
    if extract.exists():
        extract_text = extract.read_text(encoding="utf-8")
        if "async function callClaude" in extract_text and 'from "./claude"' not in extract_text:
            start = extract_text.find("async function callClaude")
            end = extract_text.find("export async function extractListingFromText")
            if start != -1 and end != -1:
                extract_text = extract_text[:start] + extract_text[end:]
                if 'from "./claude"' not in extract_text:
                    extract_text = 'import { callClaude } from "./claude";\n\n' + extract_text
                extract.write_text(extract_text, encoding="utf-8")

    route = """// src/app/api/analyze/route.ts
// HTTP 진입점 — 인증/한도/스트리밍만 담당. 분석 로직은 @/lib/analyze.

import { NextRequest, NextResponse } from \"next/server\";

import { checkRateLimit, getClientIp, rateLimitHeaders } from \"@/lib/rate-limit\";
import {
  extractParts,
  resolvePrices,
  calculateResult,
  validatePrices,
  persistAnalysisResult,
} from \"@/lib/analyze\";
import type { AnalyzeResult } from \"@/lib/analyze\";

export type { AnalyzedPart, AnalyzeResult } from \"@/lib/analyze\";

const ANALYZE_LIMIT = 8;
const ANALYZE_WINDOW_MS = 60_000;
const MAX_ANALYZE_TEXT_CHARS = 8_000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`analyze:${ip}`, ANALYZE_LIMIT, ANALYZE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: \"요청이 너무 많습니다. 잠시 후 다시 시도해주세요.\" },
      { status: 429, headers: rateLimitHeaders(rate.retryAfterMs) },
    );
  }

  let rawMode: unknown;
  let text: unknown;
  try {
    const body = await req.json();
    rawMode = body?.mode;
    text = body?.text;
  } catch {
    return NextResponse.json({ error: \"요청 형식이 올바르지 않습니다.\" }, { status: 400 });
  }

  if (typeof text !== \"string\" || !text.trim()) {
    return NextResponse.json({ error: \"텍스트를 입력해주세요.\" }, { status: 400 });
  }
  if (text.length > MAX_ANALYZE_TEXT_CHARS) {
    return NextResponse.json(
      { error: `\ubcf8\ubb38\uc740 ${MAX_ANALYZE_TEXT_CHARS.toLocaleString(\"ko-KR\")}\uc790 \uc774\ub0b4\ub85c \uc785\ub825\ud574\uc8fc\uc138\uc694.` },
      { status: 400 },
    );
  }

  const analysisMode: AnalyzeResult[\"analysisMode\"] = rawMode === \"new\" ? \"new\" : \"used\";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(data)}\\n`));
      };

      try {
        send({ pct: 10, step: \"extract\", message: \"\ubd80\ud488 \ucd94\ucd9c \uc911...\" });
        const extracted = await extractParts(text.trim());
        send({ pct: 25, step: \"extract\", message: \"\ubd80\ud488 \ucd94\ucd9c \uc644\ub8cc\" });

        send({ pct: 30, step: \"db\", message: \"DB \uc2dc\uc138 \uc870\ud68c \uc911...\" });
        const resolved = await resolvePrices(extracted, analysisMode);
        send({ pct: 60, step: \"db\", message: \"DB \uc870\ud68c \uc644\ub8cc\" });

        send({ pct: 70, step: \"calc\", message: \"\uc801\uc815\uac00 \uacc4\uc0b0 \uc911...\" });
        const calculated = await calculateResult(extracted, resolved, analysisMode);
        send({ pct: 85, step: \"calc\", message: \"\uacc4\uc0b0 \uc644\ub8cc\" });

        send({ pct: 90, step: \"validate\", message: \"\uac00\uaca9 \uac80\uc99d \uc911...\" });
        const validated = await validatePrices(calculated, analysisMode);
        send({ pct: 100, step: \"done\", message: \"\ubd84\uc11d \uc644\ub8cc\", result: validated });
        void persistAnalysisResult(validated).catch((error) => {
          console.error(\"\ubd84\uc11d \uacb0\uacfc \uc800\uc7a5 \uc2e4\ud328:\", error);
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : \"\ubd84\uc11d \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.\";
        send({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { \"Content-Type\": \"application/x-ndjson\" },
  });
}
"""
    route = route.replace("${JSON.stringify(data)}\\\\n", "${JSON.stringify(data)}\\n")
    ROUTE.write_text(route, encoding="utf-8")

    print("wrote", LIB / "types.ts")
    print("wrote", LIB / "claude.ts")
    print("wrote", LIB / "pipeline.ts", "bytes", (LIB / "pipeline.ts").stat().st_size)
    print("wrote", LIB / "index.ts")
    print("wrote", ROUTE, "bytes", ROUTE.stat().st_size)


if __name__ == "__main__":
    main()
