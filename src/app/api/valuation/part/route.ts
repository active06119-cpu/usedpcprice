import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { basisLabel } from "@/lib/engine/pricing/layered";
import { findPartId, resolvePartUsedBand } from "@/lib/engine/pricing/resolve-part";

// 소비자용 단일 부품 시세 조회 (인증 없음, IP 레이트리밋)
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`public:part-price:${ip}`, 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ ok: false, message: "요청이 너무 많습니다." }, { status: 429 });
    }

    const body = (await req.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ ok: false, message: "부품명을 입력해주세요." }, { status: 400 });
    }

    // 이름/별칭 정확 매칭 (제네릭 오매칭 방지 위해 loose=false)
    const partId = await findPartId(prisma, name, "", { loose: false });
    if (!partId) {
      return NextResponse.json({ ok: true, found: false, query: name });
    }

    const part = await prisma.part.findUnique({
      where: { id: partId },
      select: { fullName: true, category: true },
    });
    const band = part ? await resolvePartUsedBand(prisma, partId, part.category) : null;
    if (!part || !band) {
      return NextResponse.json({ ok: true, found: false, query: name });
    }

    return NextResponse.json({
      ok: true,
      found: true,
      name: part.fullName,
      category: part.category,
      usedLow: band.usedLow,
      usedMid: band.usedMid,
      usedHigh: band.usedHigh,
      basis: basisLabel(band),
    });
  } catch (error) {
    console.error("[public part-price]", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
