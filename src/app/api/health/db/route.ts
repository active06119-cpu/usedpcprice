import { NextResponse } from "next/server";

import { classifyDbError, envPresence, inspectPostgresUrl } from "@/lib/db-health";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const env = envPresence();
  const databaseUrl = inspectPostgresUrl(process.env.DATABASE_URL);
  const directUrl = inspectPostgresUrl(process.env.DIRECT_URL);

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
      env,
      urls: { databaseUrl, directUrl },
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
    const classified = classifyDbError(error);
    return NextResponse.json(
      {
        ok: false,
        database: "disconnected",
        message: "DB 연결 확인에 실패했습니다.",
        reason: classified.reason,
        prismaCode: classified.code,
        errorName: classified.name,
        env,
        urls: { databaseUrl, directUrl },
        checkedAt: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
