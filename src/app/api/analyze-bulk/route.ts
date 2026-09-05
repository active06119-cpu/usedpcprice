// src/app/api/analyze-bulk/route.ts
// 여러 매물 동시 분석 — "---" 구분자로 분리 + 병렬 처리

import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

const ANALYZE_LIMIT = 8;
const ANALYZE_WINDOW_MS = 60_000;
const MAX_BULK_TEXT_CHARS = 20_000;
const MAX_LISTINGS = 10;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`analyze:${ip}`, ANALYZE_LIMIT, ANALYZE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: rateLimitHeaders(rate.retryAfterMs) },
    );
  }

  let text: unknown;
  try {
    const body = await req.json();
    text = body?.text;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "텍스트 없음" }, { status: 400 });
  }
  if (text.length > MAX_BULK_TEXT_CHARS) {
    return NextResponse.json(
      { error: `본문은 ${MAX_BULK_TEXT_CHARS.toLocaleString("ko-KR")}자 이내로 입력해주세요.` },
      { status: 400 },
    );
  }

  const listings = text
    .split(/\n---+\n|\n{3,}/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 15);

  if (listings.length === 0) return NextResponse.json({ error: "매물 없음" }, { status: 400 });
  if (listings.length > MAX_LISTINGS) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_LISTINGS}개` }, { status: 400 });
  }

  for (let i = 1; i < listings.length; i += 1) {
    const extra = checkRateLimit(`analyze:${ip}`, ANALYZE_LIMIT, ANALYZE_WINDOW_MS);
    if (!extra.allowed) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429, headers: rateLimitHeaders(extra.retryAfterMs) },
      );
    }
  }

  const baseUrl = req.nextUrl.origin;
  const results = await Promise.allSettled(
    listings.map((listing: string) =>
      fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: listing }),
      }).then((r) => r.json()),
    ),
  );

  return NextResponse.json({
    total: listings.length,
    results: results.map((r, i) => ({
      index: i + 1,
      snippet: listings[i].substring(0, 60) + "...",
      status: r.status,
      data: r.status === "fulfilled" ? r.value : null,
      error: r.status === "rejected" ? r.reason : null,
    })),
  });
}
