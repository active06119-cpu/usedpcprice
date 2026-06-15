import { NextResponse } from "next/server";

import type { AnalyzeResult } from "@/app/api/analyze/route";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const saved = await prisma.valuationResult.findUnique({
      where: { id },
      select: { payload: true, createdAt: true },
    });

    if (saved) {
      const result = saved.payload as unknown as AnalyzeResult & { sourceText?: string | null };
      return NextResponse.json({
        ok: true,
        kind: "shared",
        result,
        item: {
          id,
          createdAt: saved.createdAt.toISOString(),
          askingPriceKrw: result.askingPrice,
          totalFairLow: result.totalFairLow,
          totalFairMid: result.totalFairMid,
          totalFairHigh: result.totalFairHigh,
          verdict: result.verdict,
          parts: result.parts,
        },
      });
    }

    const run = await prisma.valuationRun.findUnique({
      where: { id },
      include: {
        items: {
          include: { part: true },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ ok: false, message: "결과를 찾지 못했습니다." }, { status: 404 });
    }

    const mappedItems = run.items
      .map((item) => ({
        id: item.id,
        partId: item.partId,
        partName: item.part?.fullName ?? item.rawPartLabel ?? "미확인 부품",
        rawPartLabel: item.rawPartLabel,
        fairLowKrw: item.fairLowKrw,
        fairMidKrw: item.fairMidKrw,
        fairHighKrw: item.fairHighKrw,
        snapshotIds: item.snapshotIds,
      }))
      .sort((a, b) => (b.fairMidKrw ?? 0) - (a.fairMidKrw ?? 0));

    return NextResponse.json({
      ok: true,
      kind: "valuation_run",
      item: {
        id: run.id,
        runType: run.runType,
        listingId: run.listingId,
        askingPriceKrw: run.askingPriceKrw,
        totalFairLow: run.totalFairLow,
        totalFairMid: run.totalFairMid,
        totalFairHigh: run.totalFairHigh,
        verdict: run.verdict,
        createdAt: run.createdAt.toISOString(),
        items: mappedItems,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "결과 조회에 실패했습니다." }, { status: 500 });
  }
}
