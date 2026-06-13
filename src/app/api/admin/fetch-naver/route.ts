import { NextResponse } from "next/server";
import { BatchStatus, PartCondition, SnapshotSource } from "@prisma/client";

import { guardAdminRequest } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const DELAY_MS = 250;
const MAX_PRICE = 50_000_000;

const CATEGORY_MIN_PRICE: Record<string, number> = {
  GPU: 150_000,
  CPU: 50_000,
  RAM: 50_000,
  SSD: 15_000,
  MOTHERBOARD: 50_000,
  PSU: 30_000,
};

const CATEGORY_KEYWORD: Record<string, string> = {
  GPU: "그래픽카드",
  CPU: "CPU 프로세서",
  RAM: "램 메모리",
  SSD: "SSD",
  HDD: "HDD 하드디스크",
  MOTHERBOARD: "메인보드",
  PSU: "파워서플라이",
  CASE: "케이스",
  COOLER: "CPU쿨러",
};

type NaverShoppingItem = {
  title: string;
  link: string;
  lprice: string;
  hprice: string;
  mallName: string;
  brand: string;
  category1: string;
  category2: string;
  category3: string;
};

type TargetPart = {
  id: string;
  brandName: string;
  modelName: string;
  fullName: string;
  category: string;
};

function getMinPrice(category: string): number {
  return CATEGORY_MIN_PRICE[category] ?? 10_000;
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

function parsePrice(priceStr: string): number | null {
  const n = parseInt(priceStr.replace(/[^0-9]/g, ""), 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

function buildSearchQuery(brandName: string, modelName: string, category: string): string {
  const catKeyword = CATEGORY_KEYWORD[category] ?? "";
  return `${modelName} ${catKeyword}`.trim();
}

function isValidNewPrice(price: number, category: string): boolean {
  const minPrice = getMinPrice(category);
  return price >= minPrice && price <= MAX_PRICE;
}

async function searchNaverShopping(query: string, display = 5): Promise<NaverShoppingItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되지 않았습니다.");
  }

  const url = new URL("https://openapi.naver.com/v1/search/shop.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("sort", "asc");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!res.ok) {
    throw new Error(`Naver API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { items?: NaverShoppingItem[] };
  return data.items ?? [];
}

async function fetchClaudeNewPrice(partName: string): Promise<number | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 64,
      messages: [
        {
          role: "user",
          content: `2026년 6월 기준 한국 다나와 기준\n${partName} 신품 최저가를 알려줘.\n숫자만 반환 (예: 191500)`,
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error(`[fetch-naver] Claude error: ${res.status} ${await res.text()}`);
    return null;
  }

  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const raw = data.content?.[0]?.text ?? "";
  const match = raw.match(/\d[\d,]*/);
  if (!match) return null;

  const price = parseInt(match[0].replace(/,/g, ""), 10);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function saveNaverSnapshots(
  part: TargetPart,
  batchId: string,
  items: NaverShoppingItem[],
): Promise<number> {
  const minPrice = getMinPrice(part.category);
  let inserted = 0;

  for (const item of items) {
    const price = parsePrice(item.lprice);
    if (!price || price < minPrice || price > MAX_PRICE) continue;

    await prisma.priceSnapshot.create({
      data: {
        partId: part.id,
        batchId,
        sourceType: SnapshotSource.NAVER_SHOPPING,
        sourceUrl: item.link,
        priceKrw: price,
        condition: PartCondition.NEW,
        rawText: JSON.stringify({
          title: stripHtml(item.title),
          mallName: item.mallName,
          brand: item.brand,
          lprice: item.lprice,
          hprice: item.hprice,
          category: `${item.category1} > ${item.category2} > ${item.category3}`,
        }),
      },
    });
    inserted++;
  }

  return inserted;
}

async function saveClaudeSnapshot(
  part: TargetPart,
  batchId: string,
  price: number,
): Promise<void> {
  await prisma.priceSnapshot.create({
    data: {
      partId: part.id,
      batchId,
      sourceType: SnapshotSource.NAVER_SHOPPING,
      priceKrw: price,
      condition: PartCondition.NEW,
      rawText: JSON.stringify({
        source: "claude_fallback",
        partName: part.fullName,
        priceKrw: price,
      }),
    },
  });
}

async function updatePartNewPrice(
  part: TargetPart,
  batchId: string,
): Promise<{ outcome: "naver" | "claude" | "failed"; snapshots: number }> {
  let naverSaved = 0;

  try {
    const query = buildSearchQuery(part.brandName, part.modelName, part.category);
    const items = await searchNaverShopping(query, 5);
    naverSaved = await saveNaverSnapshots(part, batchId, items);
  } catch (error) {
    console.error(`[fetch-naver] Naver failed for "${part.fullName}":`, error);
  }

  if (naverSaved > 0) {
    return { outcome: "naver", snapshots: naverSaved };
  }

  try {
    const claudePrice = await fetchClaudeNewPrice(part.fullName);
    if (claudePrice && isValidNewPrice(claudePrice, part.category)) {
      await saveClaudeSnapshot(part, batchId, claudePrice);
      return { outcome: "claude", snapshots: 1 };
    }
  } catch (error) {
    console.error(`[fetch-naver] Claude failed for "${part.fullName}":`, error);
  }

  return { outcome: "failed", snapshots: 0 };
}

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;

    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:fetch-naver:${ip}`, 2, 120_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const batch = await prisma.importBatch.create({
      data: { source: SnapshotSource.NAVER_SHOPPING },
    });

    const parts = await prisma.part.findMany({
      where: { isActive: true },
      select: {
        id: true,
        brandName: true,
        modelName: true,
        fullName: true,
        category: true,
      },
    });

    const summary = { naver: 0, claude: 0, failed: 0 };
    let inserted = 0;

    for (const part of parts) {
      const { outcome, snapshots } = await updatePartNewPrice(part, batch.id);
      summary[outcome] += 1;
      inserted += snapshots;
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: BatchStatus.COMPLETED,
        completedAt: new Date(),
        recordCount: inserted,
      },
    });

    return NextResponse.json({
      ok: true,
      message: `신품가 업데이트 완료 (네이버 ${summary.naver}개, Claude ${summary.claude}개, 실패 ${summary.failed}개)`,
      batchId: batch.id,
      inserted,
      ...summary,
    });
  } catch (error) {
    console.error("[fetch-naver]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "네이버 신품가 업데이트에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
