import { NextResponse } from "next/server";
import { PartCondition, SnapshotSource } from "@prisma/client";

import { guardAdminRequest } from "@/lib/admin-guard";
import { shouldPersistUsedPrice } from "@/lib/engine/pricing";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const AI_PRICE_SYSTEM = `
너는 2024~2025년 한국 중고 PC 부품 시세 전문가야.
2025년 6월 기준 한국 번개장터/당근마켓 중고 시세.
아래 가격대를 참고해서 추정해줘:

GPU 기준:
RTX 4090: 130~160만원, RTX 4080: 80~100만원
RTX 4070 Ti: 65~80만원, RTX 4070: 48~58만원
RTX 4060 Ti: 30~38만원, RTX 4060: 24~30만원
RTX 3090: 55~70만원, RTX 3080: 35~48만원
RTX 3070: 24~32만원, RTX 3060 Ti: 17~23만원
RTX 3060: 14~18만원

CPU 기준:
i9-13900K: 38~48만원, i7-13700K: 28~35만원
i5-13600K: 20~26만원, i5-13400F: 13~17만원
Ryzen 9 7950X: 50~65만원, Ryzen 7 7800X3D: 32~42만원
Ryzen 5 7600X: 18~24만원, Ryzen 5 5600X: 11~15만원

이 기준에서 크게 벗어나면 안 됨.
각 부품당 GOOD 상태 기준 usedLow/usedMid/usedHigh를 원(KRW) 정수로 반환.

JSON 배열 형식으로만 반환:
[
  {
    "partName": "RTX 4070",
    "usedLow": 480000,
    "usedMid": 530000,
    "usedHigh": 580000
  }
]
`;

const CLAUDE_CHUNK_SIZE = 40;

type TargetPart = {
  id: string;
  fullName: string;
  category: string;
};

async function callClaude(partNames: string[]): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: AI_PRICE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `다음 부품들의 2025년 한국 중고 시세를 알려줘.\n각 부품당 GOOD 상태 기준 low/mid/high 가격\n\n${partNames.join("\n")}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? "";
}

function parseAiPrices(raw: string): Array<{
  partName: string;
  usedLow: number;
  usedMid: number;
  usedHigh: number;
}> {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
  const rows: Array<{ partName: string; usedLow: number; usedMid: number; usedHigh: number }> = [];

  for (const row of parsed) {
    const partName = String(row.partName ?? "").trim();
    const usedLow = Number(row.usedLow ?? 0);
    const usedMid = Number(row.usedMid ?? 0);
    const usedHigh = Number(row.usedHigh ?? 0);
    if (!partName || !Number.isFinite(usedMid) || usedMid <= 0) continue;
    rows.push({
      partName,
      usedLow: Number.isFinite(usedLow) && usedLow > 0 ? usedLow : Math.round(usedMid * 0.9),
      usedMid,
      usedHigh: Number.isFinite(usedHigh) && usedHigh > 0 ? usedHigh : Math.round(usedMid * 1.1),
    });
  }

  return rows;
}

function findTargetPart(targets: TargetPart[], partName: string): TargetPart | null {
  const needle = partName.toLowerCase();
  return (
    targets.find((part) => {
      const hay = part.fullName.toLowerCase();
      return hay.includes(needle) || needle.includes(hay);
    }) ?? null
  );
}

function isValidBand(
  partName: string,
  category: string,
  usedLow: number,
  usedMid: number,
  usedHigh: number,
): boolean {
  if (usedLow <= 0 || usedMid <= 0 || usedHigh <= 0) return false;
  if (usedLow > usedMid || usedMid > usedHigh) return false;
  return (
    shouldPersistUsedPrice(usedLow, partName, category) &&
    shouldPersistUsedPrice(usedMid, partName, category) &&
    shouldPersistUsedPrice(usedHigh, partName, category)
  );
}

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;

    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:generate-ai-prices:${ip}`, 2, 300_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { ok: false, message: "ANTHROPIC_API_KEY가 설정되지 않았습니다." },
        { status: 500 },
      );
    }

    const activeParts = await prisma.part.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        category: true,
        _count: { select: { snapshots: true } },
      },
    });

    const targets: TargetPart[] = activeParts
      .filter((part) => part._count.snapshots < 3)
      .map((part) => ({
        id: part.id,
        fullName: part.fullName,
        category: part.category,
      }));

    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "0개 부품 시세 생성됨",
        partsGenerated: 0,
        snapshotsInserted: 0,
      });
    }

    let partsGenerated = 0;
    let snapshotsInserted = 0;
    const matchedPartIds = new Set<string>();

    for (let i = 0; i < targets.length; i += CLAUDE_CHUNK_SIZE) {
      const chunk = targets.slice(i, i + CLAUDE_CHUNK_SIZE);
      const aiRaw = await callClaude(chunk.map((part) => part.fullName));
      const aiRows = parseAiPrices(aiRaw);

      for (const row of aiRows) {
        const target = findTargetPart(chunk, row.partName);
        if (!target || matchedPartIds.has(target.id)) continue;
        if (!isValidBand(target.fullName, target.category, row.usedLow, row.usedMid, row.usedHigh)) {
          continue;
        }

        await prisma.priceSnapshot.createMany({
          data: [
            {
              partId: target.id,
              sourceType: SnapshotSource.AI_ESTIMATED,
              priceKrw: row.usedLow,
              condition: PartCondition.GOOD,
              rawText: JSON.stringify({ source: "admin-generate-ai-prices", band: "low" }),
            },
            {
              partId: target.id,
              sourceType: SnapshotSource.AI_ESTIMATED,
              priceKrw: row.usedMid,
              condition: PartCondition.GOOD,
              rawText: JSON.stringify({ source: "admin-generate-ai-prices", band: "mid" }),
            },
            {
              partId: target.id,
              sourceType: SnapshotSource.AI_ESTIMATED,
              priceKrw: row.usedHigh,
              condition: PartCondition.GOOD,
              rawText: JSON.stringify({ source: "admin-generate-ai-prices", band: "high" }),
            },
          ],
        });

        matchedPartIds.add(target.id);
        partsGenerated += 1;
        snapshotsInserted += 3;
      }
    }

    return NextResponse.json({
      ok: true,
      message: `${partsGenerated}개 부품 시세 생성됨`,
      partsGenerated,
      snapshotsInserted,
      targetCount: targets.length,
    });
  } catch (error) {
    console.error("[generate-ai-prices]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "AI 시세 생성에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
