import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type ParsedPart = {
  category: "CPU" | "GPU" | "RAM" | "SSD" | "HDD" | "MAINBOARD" | "PSU" | "CASE" | "ETC";
  name: string;
  price: number | null;
  condition: "새상품" | "사용감적음" | "사용감있음" | "알수없음";
};

type ParseResponse = {
  parts: ParsedPart[];
};

const PARSE_SYSTEM = `아래 중고 매물 텍스트에서 PC 부품을 추출해줘.
JSON으로만 응답해.
{
  parts: [
    {
      category: CPU|GPU|RAM|SSD|HDD|MAINBOARD|PSU|CASE|ETC,
      name: 부품명,
      price: 가격(숫자만),
      condition: 새상품|사용감적음|사용감있음|알수없음
    }
  ]
}
매물 텍스트: {크롤링한 본문}`;

function toPartCategory(category: ParsedPart["category"]): "CPU" | "GPU" | "RAM" | "SSD" | "HDD" | "MOTHERBOARD" | "PSU" | "CASE" | "OTHER" {
  if (category === "MAINBOARD") return "MOTHERBOARD";
  if (category === "ETC") return "OTHER";
  return category;
}

function toPartCondition(
  condition: ParsedPart["condition"],
): "NEW" | "GOOD" | "FAIR" | null {
  if (condition === "새상품") return "NEW";
  if (condition === "사용감적음") return "GOOD";
  if (condition === "사용감있음") return "FAIR";
  return null;
}

function parseListedAt(text: string): Date | null {
  const absolute = text.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (absolute) {
    const y = Number(absolute[1]);
    const m = Number(absolute[2]);
    const d = Number(absolute[3]);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const relativeDays = text.match(/(\d+)\s*일\s*전/);
  if (relativeDays) {
    const days = Number(relativeDays[1]);
    if (Number.isFinite(days)) {
      return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    }
  }
  return null;
}

function parseSaleStatus(text: string): "ACTIVE" | "SOLD" | "RESERVED" | "UNKNOWN" {
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

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const ogTitleMatch = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const descMetaMatch = html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const ogDescMatch = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i);

  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  const title = (ogTitleMatch?.[1] ?? titleMatch?.[1] ?? "제목 없음").replace(/\s+/g, " ").trim();
  const description = (ogDescMatch?.[1] ?? descMetaMatch?.[1] ?? stripped.slice(0, 4000)).trim();
  const rawText = `${title}\n\n${description}\n\n${stripped.slice(0, 8000)}`;

  return { title, description, rawText };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string };
    const sourceUrl = body.url?.trim();
    if (!sourceUrl) {
      return NextResponse.json({ ok: false, message: "URL을 입력해주세요." }, { status: 400 });
    }

    const duplicateCount = await prisma.partsPrice.count({
      where: { sourceUrl },
    });
    if (duplicateCount > 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        message: "이미 등록된 URL입니다.",
        inserted: 0,
      });
    }

    const crawled = await crawlListing(sourceUrl);

    const aiRaw = await callClaude(
      PARSE_SYSTEM,
      `매물 텍스트: ${crawled.rawText}`,
    );
    const cleaned = aiRaw.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Claude 응답에서 JSON을 찾지 못했습니다.");
    }
    const parsed = JSON.parse(jsonMatch[0]) as ParseResponse;
    const parts = Array.isArray(parsed.parts) ? parsed.parts : [];

    if (parts.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "부품 파싱 결과가 없습니다.",
      }, { status: 422 });
    }

    const listedAt = parseListedAt(crawled.rawText);
    const saleStatus = parseSaleStatus(crawled.rawText);

    const created = await prisma.$transaction(
      parts.map((part) =>
        prisma.partsPrice.create({
          data: {
            sourceUrl,
            title: crawled.title,
            description: crawled.description,
            rawText: crawled.rawText,
            listedAt,
            saleStatus,
            category: toPartCategory(part.category) as any,
            name: part.name,
            priceKrw: typeof part.price === "number" ? part.price : null,
            condition: toPartCondition(part.condition) as any,
          },
        }),
      ),
    );

    return NextResponse.json({
      ok: true,
      skipped: false,
      inserted: created.length,
      saleStatus,
      listedAt,
    });
  } catch (error) {
    console.error("market import failed:", error);
    return NextResponse.json({ ok: false, message: "크롤링/파싱/저장에 실패했습니다." }, { status: 500 });
  }
}
