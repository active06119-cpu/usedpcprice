import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

    const snapshots = await prisma.priceSnapshot.findMany({
      take: limit,
      orderBy: { capturedAt: "desc" },
      select: {
        id: true,
        sourceType: true,
        sourceUrl: true,
        priceKrw: true,
        condition: true,
        capturedAt: true,
        part: {
          select: {
            id: true,
            fullName: true,
            category: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      count: snapshots.length,
      items: snapshots.map((item) => ({
        snapshotId: item.id,
        sourceType: item.sourceType,
        sourceUrl: item.sourceUrl,
        priceKrw: item.priceKrw,
        condition: item.condition,
        capturedAt: item.capturedAt,
        partId: item.part.id,
        partName: item.part.fullName,
        category: item.part.category,
      })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "최근 시세 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
