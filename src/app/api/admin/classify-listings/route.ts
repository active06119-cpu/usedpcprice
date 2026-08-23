import { NextResponse } from "next/server";
import { PartCondition, SnapshotSource } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { priceRangeByCategory } from "@/lib/engine/pricing/guards";
import { findOrCreatePart } from "@/lib/ingest/manual-price-writer";

const CLASSIFY_SYSTEM = `너는 한국 중고거래(당근마켓/번개장터) 검색결과 스크린샷을 분석하는 분류기다.
이미지에서 각 매물을 찾아 아래 규칙으로 분류하고 JSON만 반환한다. 설명·마크다운 없이 순수 JSON.

각 매물:
{
  "title": "매물 제목 그대로",
  "priceKrw": 가격(숫자만, 1원 같은 것도 그대로 숫자),
  "type": "SINGLE_PART" | "WHOLE_PC" | "SKIP",
  "category": "GPU|CPU|RAM|SSD|HDD|MOTHERBOARD|PSU|CASE|COOLER|MONITOR",  // SINGLE_PART일 때만
  "name": "영문 표준 모델명",   // SINGLE_PART일 때만 (예: "GTX 1060", "RTX 4070 SUPER", "i5-13600K")
  "reason": "WHOLE_PC/SKIP 사유 짧게"
}

분류 규칙:
- SINGLE_PART: 부품 딱 하나만 파는 매물 (그래픽카드/CPU/램/SSD/파워/메인보드 하나).
- WHOLE_PC: 조립컴퓨터·본체·게이밍PC 통째 (부품 여러 개 조립됨).
- SKIP: 아래는 저장하면 안 됨
    · "삽니다/삽니당/구합니다/구매" = 사는 글 (파는 게 아님)
    · "교환", 가격이 "1원"/"가격제안"/비정상
    · 노트북
    · 부품 2개 이상 묶음(본체 아님, 예: CPU+메인보드 세트)

부품명은 한국어/약칭을 영문 표준으로: "지포스 1060"→"GTX 1060", "4070 슈퍼"→"RTX 4070 SUPER", "라이젠 5600"→"Ryzen 5 5600".

출력: {"listings":[ ... ]}`;

type Classified = {
  title: string;
  priceKrw: number | null;
  type: "SINGLE_PART" | "WHOLE_PC" | "SKIP";
  category?: string;
  name?: string;
  reason?: string;
};

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  return { mediaType: m[1], base64: m[2] };
}

async function classifyImage(mediaType: string, base64: string): Promise<Classified[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: CLASSIFY_SYSTEM,
      // 도구 호출로 구조화 출력 강제 (프로즈 방지, Claude 5는 프리필 미지원이라 이 방식 사용)
      tools: [
        {
          name: "report_listings",
          description: "스크린샷에서 분류한 매물 목록을 보고한다.",
          input_schema: {
            type: "object",
            properties: {
              listings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "매물 제목" },
                    priceKrw: { type: "number", description: "가격(원, 숫자만)" },
                    type: { type: "string", enum: ["SINGLE_PART", "WHOLE_PC", "SKIP"] },
                    category: {
                      type: "string",
                      enum: ["GPU", "CPU", "RAM", "SSD", "HDD", "MOTHERBOARD", "PSU", "CASE", "COOLER", "MONITOR"],
                    },
                    name: { type: "string", description: "SINGLE_PART일 때 영문 표준 모델명" },
                    reason: { type: "string", description: "WHOLE_PC/SKIP 사유" },
                  },
                  required: ["title", "type"],
                },
              },
            },
            required: ["listings"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_listings" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "이 검색결과 스크린샷의 매물들을 분류해서 report_listings 도구로 보고해줘." },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type?: string; input?: { listings?: Classified[] } }>;
    stop_reason?: string;
  };
  // 도구 호출 결과에서 구조화된 listings 를 바로 읽음
  const toolUse = (data.content ?? []).find((c) => c.type === "tool_use");
  const listings = toolUse?.input?.listings;
  if (!Array.isArray(listings)) {
    console.error("[classify-listings] tool_use 없음. stop_reason=", data.stop_reason, JSON.stringify(data.content)?.slice(0, 500));
    throw new Error(`Claude 응답에서 분류 결과를 못 받음 (stop:${data.stop_reason ?? "?"}).`);
  }
  return listings;
}

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;

    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:classify-listings:${ip}`, 10, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const body = (await req.json()) as { image?: string; apply?: boolean };
    const img = body.image ? parseDataUrl(body.image) : null;
    if (!img) {
      return NextResponse.json({ ok: false, message: "이미지가 없거나 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const listings = await classifyImage(img.mediaType, img.base64);

    // 단품 중 저장 가능한 것만 추리기 (가격 상식범위 통과)
    const singles = listings.filter((l) => l.type === "SINGLE_PART");
    const saveable = singles.filter((l) => {
      if (!l.name || !l.category || typeof l.priceKrw !== "number" || l.priceKrw <= 0) return false;
      const r = priceRangeByCategory(l.category);
      return l.priceKrw >= r.min && l.priceKrw <= r.max;
    });
    const wholePcs = listings.filter((l) => l.type === "WHOLE_PC");
    const skipped = listings.filter((l) => l.type === "SKIP");

    if (!body.apply) {
      return NextResponse.json({
        ok: true,
        applied: false,
        counts: { single: singles.length, saveable: saveable.length, wholePc: wholePcs.length, skip: skipped.length },
        listings,
      });
    }

    let saved = 0;
    for (const l of saveable) {
      const partId = await findOrCreatePart(prisma, l.name!, l.category!);
      await prisma.priceSnapshot.create({
        data: {
          partId,
          sourceType: SnapshotSource.DAANGN,
          priceKrw: l.priceKrw as number,
          condition: PartCondition.GOOD,
          rawText: JSON.stringify({ source: "classify-capture", title: l.title }),
        },
      });
      saved++;
    }

    return NextResponse.json({
      ok: true,
      applied: true,
      saved,
      counts: { single: singles.length, saveable: saveable.length, wholePc: wholePcs.length, skip: skipped.length },
      listings,
    });
  } catch (error) {
    console.error("[classify-listings]", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "분류에 실패했습니다." },
      { status: 500 },
    );
  }
}
