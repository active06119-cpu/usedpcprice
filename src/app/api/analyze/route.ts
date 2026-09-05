// src/app/api/analyze/route.ts
// HTTP 진입점 — 인증/한도/스트리밍만 담당. 분석 로직은 @/lib/analyze.

import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import {
  extractParts,
  resolvePrices,
  calculateResult,
  validatePrices,
  persistAnalysisResult,
} from "@/lib/analyze";
import type { AnalyzeResult } from "@/lib/analyze";

export type { AnalyzedPart, AnalyzeResult } from "@/lib/analyze";

const ANALYZE_LIMIT = 8;
const ANALYZE_WINDOW_MS = 60_000;
const MAX_ANALYZE_TEXT_CHARS = 8_000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`analyze:${ip}`, ANALYZE_LIMIT, ANALYZE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
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
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "텍스트를 입력해주세요." }, { status: 400 });
  }
  if (text.length > MAX_ANALYZE_TEXT_CHARS) {
    return NextResponse.json(
      { error: `본문은 ${MAX_ANALYZE_TEXT_CHARS.toLocaleString("ko-KR")}자 이내로 입력해주세요.` },
      { status: 400 },
    );
  }

  const analysisMode: AnalyzeResult["analysisMode"] = rawMode === "new" ? "new" : "used";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
      };

      try {
        send({ pct: 10, step: "extract", message: "부품 추출 중..." });
        const extracted = await extractParts(text.trim());
        send({ pct: 25, step: "extract", message: "부품 추출 완료" });

        send({ pct: 30, step: "db", message: "DB 시세 조회 중..." });
        const resolved = await resolvePrices(extracted, analysisMode);
        send({ pct: 60, step: "db", message: "DB 조회 완료" });

        send({ pct: 70, step: "calc", message: "적정가 계산 중..." });
        const calculated = await calculateResult(extracted, resolved, analysisMode);
        send({ pct: 85, step: "calc", message: "계산 완료" });

        send({ pct: 90, step: "validate", message: "가격 검증 중..." });
        const validated = await validatePrices(calculated, analysisMode);
        send({ pct: 100, step: "done", message: "분석 완료", result: validated });
        void persistAnalysisResult(validated).catch((error) => {
          console.error("분석 결과 저장 실패:", error);
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.";
        send({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
