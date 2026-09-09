import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { parseDataUrl, valuatePc } from "@/lib/engine/pc-valuation";
import {
  applyAskingPrice,
  listingCacheId,
  readCachedValuation,
} from "@/lib/engine/valuation-cache";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: string; image?: string; askingPriceKrw?: number };
    const img = body.image ? parseDataUrl(body.image) : null;
    if (!body.text?.trim() && !img) {
      return NextResponse.json({ ok: false, message: "매물 사양이나 캡처를 넣어주세요." }, { status: 400 });
    }

    const cacheId = listingCacheId(
      img ? img.base64.slice(0, 4000) : body.text?.trim() ?? "",
      Boolean(img),
    );
    const cached = await readCachedValuation(prisma, cacheId);
    if (cached) {
      return NextResponse.json({
        ok: true,
        cached: true,
        ...applyAskingPrice(cached, body.askingPriceKrw),
      });
    }

    const ip = getClientIp(req);
    const perMin = checkRateLimit(`public:pc-valuation:${ip}`, 5, 60_000);
    const perDay = checkRateLimit(`public:pc-valuation-day:${ip}`, 20, 86_400_000);
    if (!perMin.allowed || !perDay.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const result = await valuatePc(prisma, {
      text: body.text?.trim(),
      image: img ?? undefined,
      askingPriceKrw: body.askingPriceKrw,
      cacheId,
    });
    return NextResponse.json({ ok: true, cached: false, ...result });
  } catch (error) {
    console.error("[public pc-valuation]", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "판정에 실패했습니다." },
      { status: 500 },
    );
  }
}
