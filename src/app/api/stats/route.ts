import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const [analysisCount, partCount, snapshotCount] = await Promise.all([
    prisma.valuationRun.count(),
    prisma.part.count(),
    prisma.priceSnapshot.count(),
  ]);

  return NextResponse.json({
    analysisCount,
    partCount,
    snapshotCount,
  });
}
