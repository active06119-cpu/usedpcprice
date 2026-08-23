import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { parseDataUrl, valuatePc } from "@/lib/engine/pc-valuation";

// 소비자용 공용 판정 (인증 없음, IP 레이트리밋으로 남용 방지)
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`public:pc-valuation:${ip}`, 8, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const body = (await req.json()) as { text?: string; image?: string; askingPriceKrw?: number };
    const img = body.image ? parseDataUrl(body.image) : null;
    if (!body.text?.trim() && !img) {
      return NextResponse.json({ ok: false, message: "매물 사양이나 캡처를 넣어주세요." }, { status: 400 });
    }

    const result = await valuatePc(prisma, {
      text: body.text?.trim(),
      image: img ?? undefined,
      askingPriceKrw: body.askingPriceKrw,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[public pc-valuation]", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "판정에 실패했습니다." },
      { status: 500 },
    );
  }
}
