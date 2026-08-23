import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { parseDataUrl, valuatePc } from "@/lib/engine/pc-valuation";

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;
    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:pc-valuation:${ip}`, 15, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ ok: false, message: "요청이 너무 많습니다." }, { status: 429 });
    }

    const body = (await req.json()) as { text?: string; image?: string; askingPriceKrw?: number };
    const img = body.image ? parseDataUrl(body.image) : null;
    if (!body.text?.trim() && !img) {
      return NextResponse.json({ ok: false, message: "매물 텍스트나 이미지를 넣어주세요." }, { status: 400 });
    }

    const result = await valuatePc(prisma, {
      text: body.text?.trim(),
      image: img ?? undefined,
      askingPriceKrw: body.askingPriceKrw,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[pc-valuation]", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "판정에 실패했습니다." },
      { status: 500 },
    );
  }
}
