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
  let slug = "";
  let partName = "";

  try {
    const resolved = await params;
    slug = resolved.slug;
    partName = slugToName(slug);

    const q = partName;
    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(Number(searchParams.get("days") ?? 60), 1), 365);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let part: { id: string; fullName: string; category: string } | null = null;

    try {
      part = await prisma.part.findFirst({
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
    } catch (error) {
      console.error("[price-profile] part lookup failed:", { slug, error });
      return NextResponse.json(
        {
          ok: false,
          message: "부품 정보 조회에 실패했습니다.",
          partName,
        },
        { status: 500 },
      );
    }

    if (!part) {
      return NextResponse.json(
        { ok: false, message: "부품을 찾지 못했습니다.", partName },
        { status: 404 },
      );
    }

    partName = part.fullName;

    let usedSnapshots: Array<{ priceKrw: number; condition: PartCondition; capturedAt: Date }> = [];
    let newPrice: number | null = null;
    let conditionSummary: Array<{ condition: PartCondition; priceKrw: number | null; sampleSize: number }> =
      [];

    try {
      usedSnapshots = await prisma.priceSnapshot.findMany({
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

      newPrice = newSnapshot?.priceKrw ?? null;

      conditionSummary = await Promise.all(
        [PartCondition.NEW, PartCondition.LIKE_NEW, PartCondition.GOOD, PartCondition.FAIR].map(
          async (condition) => {
            const prices = (
              await prisma.priceSnapshot.findMany({
                where: {
                  partId: part!.id,
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
          },
        ),
      );
    } catch (error) {
      console.error("[price-profile] snapshot query failed:", { slug, partId: part.id, error });
      return NextResponse.json(
        {
          ok: false,
          message: "가격 프로필 조회에 실패했습니다.",
          partName,
          part: { fullName: part.fullName, category: part.category },
        },
        { status: 500 },
      );
    }

    const usedPrices = usedSnapshots.map((s) => s.priceKrw).sort((a, b) => a - b);
    const usedMid = quantile(usedPrices, 0.5);
    const usedLow = quantile(usedPrices, 0.1);
    const usedHigh = quantile(usedPrices, 0.9);
    const depreciationPct =
      usedMid && newPrice && newPrice > 0
        ? Math.max(0, Math.round((1 - usedMid / newPrice) * 100))
        : null;

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
      latestCapturedAt:
        usedSnapshots.length > 0 ? usedSnapshots[usedSnapshots.length - 1].capturedAt : null,
    });
  } catch (error) {
    console.error("[price-profile] unexpected error:", { slug, partName, error });
    return NextResponse.json(
      {
        ok: false,
        message: "가격 프로필 조회에 실패했습니다.",
        partName: partName || slugToName(slug),
      },
      { status: 500 },
    );
  }
}
