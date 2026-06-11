import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

import { prisma } from "@/lib/prisma";
import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

type ParsedPart = {
  category: "CPU" | "GPU" | "RAM" | "SSD" | "HDD" | "MAINBOARD" | "PSU" | "CASE" | "ETC";
  name: string;
  price: number | null;
  condition: "새상품" | "사용감적음" | "사용감있음" | "알수없음";
};

type ClaudeParseResult = {
  parts: ParsedPart[];
  total_price?: number | null;
  source?: string;
};

const PARSE_SYSTEM = `아래 중고 매물 텍스트에서 PC 부품을 추출해줘.
JSON으로만 응답해. 마크다운 없이 순수 JSON만.
{
  "parts": [
    {
      "category": "CPU|GPU|RAM|SSD|HDD|MAINBOARD|PSU|CASE|ETC",
      "name": "부품명",
      "price": 가격(숫자만, 묶음이면 부품별 추정),
      "condition": "새상품|사용감적음|사용감있음|알수없음"
    }
  ],
  "total_price": 전체가격,
  "source": "중고나라|번개장터|기타"
}`;

function parseListedAt(text: string): string | null {
  const absolute = text.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (absolute) {
    const y = Number(absolute[1]);
    const m = Number(absolute[2]);
    const d = Number(absolute[3]);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  const relativeDays = text.match(/(\d+)\s*일\s*전/);
  if (relativeDays) {
    const days = Number(relativeDays[1]);
    if (Number.isFinite(days)) {
      return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    }
  }
  return null;
}

function parseSoldStatus(text: string): "ACTIVE" | "SOLD" | "RESERVED" | "UNKNOWN" {
  if (/(판매완료|거래완료|sold\s*out)/i.test(text)) return "SOLD";
  if (/(예약중|예약)/i.test(text)) return "RESERVED";
  if (/(판매중|거래중|active)/i.test(text)) return "ACTIVE";
  return "UNKNOWN";
}

async function callClaude(system: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API failed: ${body}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

async function crawlListing(url: string): Promise<{ title: string; description: string; rawText: string }> {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (host && /(daangn\.com|joongna\.com|bunjang\.co\.kr)/i.test(host)) {
    throw new Error("사이트 정책상 본문 크롤링이 제한된 매물입니다. 본문 텍스트를 직접 붙여넣어 주세요.");
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error("페이지를 불러오지 못했습니다.");
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('meta[property="og:title"]').attr("content")?.trim() || $("title").text().trim() || "제목 없음";
  const description =
    $('meta[property="og:description"]').attr("content")?.trim() ||
    $('meta[name="description"]').attr("content")?.trim() ||
    "";

  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const rawText = `${title}\n\n${description}\n\n${text.slice(0, 9000)}`;

  return { title, description, rawText };
}

export async function POST(req: NextRequest) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;

    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:url-analyze:${ip}`, 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const body = (await req.json()) as { url?: string };
    const sourceUrl = body.url?.trim();
    if (!sourceUrl) {
      return NextResponse.json({ ok: false, message: "URL을 입력해주세요." }, { status: 400 });
    }
    try {
      const parsed = new URL(sourceUrl);
      if (!/^https?:$/i.test(parsed.protocol)) {
        return NextResponse.json({ ok: false, message: "http/https URL만 허용됩니다." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ ok: false, message: "URL 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const duplicateCount = await prisma.partsPrice.count({ where: { sourceUrl } });
    if (duplicateCount > 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        message: "이미 등록된 URL입니다.",
      });
    }

    const crawled = await crawlListing(sourceUrl);
    const soldStatus = parseSoldStatus(crawled.rawText);
    const registeredAt = parseListedAt(crawled.rawText);

    const aiRaw = await callClaude(PARSE_SYSTEM, `매물 텍스트: ${crawled.rawText}`);
    const cleaned = aiRaw.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Claude 응답에서 JSON을 찾지 못했습니다.");
    }

    const parsed = JSON.parse(jsonMatch[0]) as ClaudeParseResult;
    const parts = Array.isArray(parsed.parts) ? parsed.parts : [];
    const totalFairMid = parts.reduce((sum, part) => sum + (typeof part.price === "number" ? part.price : 0), 0);
    const totalFairLow = Math.round(totalFairMid * 0.9);
    const totalFairHigh = Math.round(totalFairMid * 1.1);
    const askingPrice = typeof parsed.total_price === "number" ? parsed.total_price : null;

    let verdict: "CHEAP" | "FAIR" | "OVERPRICED" | "WAY_OVERPRICED" | "NO_PRICE" = "NO_PRICE";
    if (askingPrice && totalFairMid > 0) {
      const ratio = askingPrice / totalFairMid;
      if (ratio <= 0.9) verdict = "CHEAP";
      else if (ratio <= 1.05) verdict = "FAIR";
      else if (ratio <= 1.2) verdict = "OVERPRICED";
      else verdict = "WAY_OVERPRICED";
    }

    try {
      await prisma.valuationRun.create({
        data: {
          runType: "BUYER_CHECK" as any,
          totalFairMid,
          totalFairLow,
          totalFairHigh,
          askingPriceKrw: askingPrice,
          verdict,
        },
      });
    } catch (e) {
      console.error("valuationRun save failed in url-analyze:", e);
    }

    return NextResponse.json({
      ok: true,
      skipped: false,
      preview: {
        sourceUrl,
        title: crawled.title,
        description: crawled.description,
        rawText: crawled.rawText,
        source: parsed.source ?? "기타",
        totalPrice: parsed.total_price ?? null,
        soldStatus,
        registeredAt,
        parts,
      },
    });
  } catch (error) {
    console.error("url analyze failed:", error);
    const message = error instanceof Error ? error.message : "URL 분석에 실패했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
