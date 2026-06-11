import { PartCondition } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ slug: string }>;
};

function slugToName(slug: string) {
  return slug.replace(/-/g, " ").trim();
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx];
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const q = slugToName(slug);
    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(Number(searchParams.get("days") ?? 60), 1), 365);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const part = await prisma.part.findFirst({
      where: {
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { modelName: { contains: q, mode: "insensitive" } },
          { aliases: { some: { alias: { contains: q.toLowerCase() } } } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        category: true,
      },
    });

    if (!part) {
      return NextResponse.json({ ok: false, message: "부품을 찾지 못했습니다." }, { status: 404 });
    }

    const usedSnapshots = await prisma.priceSnapshot.findMany({
      where: {
        partId: part.id,
        capturedAt: { gte: from },
        sourceType: { in: ["BUNJANG", "DAANGN", "JOONGNA", "MANUAL"] as any },
      },
      select: {
        priceKrw: true,
        condition: true,
        capturedAt: true,
      },
      orderBy: { capturedAt: "asc" },
    });

    const newSnapshot = await prisma.priceSnapshot.findFirst({
      where: {
        partId: part.id,
        capturedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        sourceType: { in: ["NAVER_SHOPPING", "DANAWA"] as any },
      },
      orderBy: { capturedAt: "desc" },
      select: {
        priceKrw: true,
      },
    });

    const usedPrices = usedSnapshots.map((s) => s.priceKrw).sort((a, b) => a - b);
    const usedMid = quantile(usedPrices, 0.5);
    const usedLow = quantile(usedPrices, 0.1);
    const usedHigh = quantile(usedPrices, 0.9);
    const newPrice = newSnapshot?.priceKrw ?? null;
    const depreciationPct =
      usedMid && newPrice && newPrice > 0 ? Math.max(0, Math.round((1 - usedMid / newPrice) * 100)) : null;

    const conditionSummary = await Promise.all(
      [PartCondition.NEW, PartCondition.LIKE_NEW, PartCondition.GOOD, PartCondition.FAIR].map(async (condition) => {
        const prices = (
          await prisma.priceSnapshot.findMany({
            where: {
              partId: part.id,
              capturedAt: { gte: from },
              condition,
              sourceType: { in: ["BUNJANG", "DAANGN", "JOONGNA", "MANUAL"] as any },
            },
            select: { priceKrw: true },
            orderBy: { capturedAt: "desc" },
          })
        )
          .map((row) => row.priceKrw)
          .sort((a, b) => a - b);

        return {
          condition,
          priceKrw: quantile(prices, 0.5),
          sampleSize: prices.length,
        };
      }),
    );

    return NextResponse.json({
      ok: true,
      part: {
        id: part.id,
        slug,
        fullName: part.fullName,
        category: part.category,
      },
      summary: {
        usedLow,
        usedMid,
        usedHigh,
        newPrice,
        depreciationPct,
        sampleSize: usedPrices.length,
      },
      trend: usedSnapshots.map((s) => ({
        capturedAt: s.capturedAt,
        priceKrw: s.priceKrw,
      })),
      conditions: conditionSummary,
      latestCapturedAt: usedSnapshots.length > 0 ? usedSnapshots[usedSnapshots.length - 1].capturedAt : null,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "가격 프로필 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
