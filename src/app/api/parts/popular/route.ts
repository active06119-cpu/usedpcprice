import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 10), 30);
    const days = Math.min(Number(searchParams.get("days") ?? 30), 365);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const grouped = await prisma.priceSnapshot.groupBy({
      by: ["partId"],
      where: {
        capturedAt: { gte: cutoff },
      },
      _count: {
        _all: true,
      },
      _avg: {
        priceKrw: true,
      },
      orderBy: {
        _count: {
          partId: "desc",
        },
      },
      take: limit,
    });

    const partIds = grouped.map((row) => row.partId);
    const parts = await prisma.part.findMany({
      where: { id: { in: partIds } },
      select: {
        id: true,
        fullName: true,
        category: true,
        brandName: true,
        modelName: true,
      },
    });

    const byId = new Map(parts.map((part) => [part.id, part]));
    const items = grouped
      .map((row) => {
        const part = byId.get(row.partId);
        if (!part) return null;

        return {
          partId: part.id,
          partName: part.fullName,
          category: part.category,
          brandName: part.brandName,
          modelName: part.modelName,
          sampleCount: row._count._all,
          avgPriceKrw: row._avg.priceKrw ? Math.round(row._avg.priceKrw) : null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return NextResponse.json({
      ok: true,
      days,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "인기 부품 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
