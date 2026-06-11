import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [partsCount, aliasesCount, snapshotsCount, marketListingsCount, partsPriceCount] = await Promise.all([
      prisma.part.count(),
      prisma.partAlias.count(),
      prisma.priceSnapshot.count(),
      prisma.marketListing.count().catch(() => -1),
      prisma.partsPrice.count().catch(() => -1),
    ]);

    return NextResponse.json({
      ok: true,
      database: "connected",
      counts: {
        parts: partsCount,
        aliases: aliasesCount,
        snapshots: snapshotsCount,
        marketListings: marketListingsCount,
        partsPrice: partsPriceCount,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        ok: false,
        database: "disconnected",
        message: "DB 연결 확인에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
