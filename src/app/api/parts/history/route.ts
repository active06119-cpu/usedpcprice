import { NextResponse } from "next/server";

import { findPartId } from "@/lib/engine/pricing/resolve-part";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`public:part-history:${ip}`, 30, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ ok: false, message: "요청이 너무 많습니다." }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name")?.trim() ?? "";
    if (!name) {
      return NextResponse.json({ ok: false, message: "부품명이 필요합니다." }, { status: 400 });
    }

    const partId =
      (await findPartId(prisma, name, "", { loose: false })) ??
      (await findPartId(prisma, name, "GPU", { loose: true }));
    if (!partId) {
      return NextResponse.json({ ok: true, found: false, query: name, points: [] });
    }

    const since = new Date(Date.now() - 90 * 86_400_000);
    const snaps = await prisma.priceSnapshot.findMany({
      where: {
        partId,
        capturedAt: { gte: since },
        sourceType: { in: ["DAANGN", "BUNJANG", "JOONGNA", "MANUAL"] as any },
      },
      orderBy: { capturedAt: "asc" },
      select: { priceKrw: true, capturedAt: true },
    });

    const byDay = new Map<string, number[]>();
    for (const snap of snaps) {
      const day = snap.capturedAt.toISOString().slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(snap.priceKrw);
      byDay.set(day, list);
    }
    const points = [...byDay.entries()].map(([day, prices]) => {
      const sorted = [...prices].sort((a, b) => a - b);
      const mid = sorted[Math.floor(sorted.length / 2)];
      return { day, mid, count: prices.length };
    });

    return NextResponse.json({ ok: true, found: true, partId, query: name, points });
  } catch (error) {
    console.error("[part-history]", error);
    return NextResponse.json({ ok: false, message: "시세 추이조회에 실패했습니다." }, { status: 500 });
  }
}
