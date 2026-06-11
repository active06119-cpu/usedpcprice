import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ slug: string }>;
};

export async function GET(req: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(Number(searchParams.get("days") ?? 60), 1), 365);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 200), 1), 1000);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const part = await prisma.part.findUnique({
      where: { id: slug },
      select: { id: true, fullName: true, category: true, isActive: true },
    });
    if (!part) {
      return NextResponse.json({ ok: false, message: "부품을 찾지 못했습니다." }, { status: 404 });
    }

    const snapshots = await prisma.priceSnapshot.findMany({
      where: {
        partId: slug,
        capturedAt: { gte: from },
      },
      orderBy: { capturedAt: "desc" },
      take: limit,
      select: {
        id: true,
        sourceType: true,
        sourceUrl: true,
        priceKrw: true,
        condition: true,
        capturedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      part,
      days,
      count: snapshots.length,
      items: snapshots,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "부품 거래 데이터 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
