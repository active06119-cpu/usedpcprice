import { PartCondition, ValuationType } from "@prisma/client";
import { NextResponse } from "next/server";

import { computeBandForPart, findPartByAliasOrName } from "@/lib/valuation";
import { prisma } from "@/lib/prisma";
import { partValuationSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  try {
    const parsed = partValuationSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const modelName = body.modelName.trim();

    const part = await findPartByAliasOrName(modelName);
    if (!part) {
      return NextResponse.json({ ok: false, message: "매칭되는 부품을 찾지 못했습니다." }, { status: 404 });
    }

    const condition = body.condition ? PartCondition[body.condition] : PartCondition.GOOD;
    const monthsUsed = body.monthsUsed;
    const band = await computeBandForPart(part.id, condition, monthsUsed);

    const run = await prisma.valuationRun.create({
      data: {
        runType: ValuationType.SINGLE_PART,
        inputSpecJson: {
          modelName,
          condition,
          monthsUsed: monthsUsed ?? null,
        },
        totalFairLow: band.low,
        totalFairMid: band.mid,
        totalFairHigh: band.high,
        verdict: "FAIR",
      },
    });

    const usedSnapshots = await prisma.priceSnapshot.findMany({
      where: { partId: part.id },
      orderBy: { capturedAt: "desc" },
      take: 20,
      select: { id: true },
    });

    await prisma.valuationItem.create({
      data: {
        valuationRunId: run.id,
        partId: part.id,
        rawPartLabel: modelName,
        fairLowKrw: band.low,
        fairMidKrw: band.mid,
        fairHighKrw: band.high,
        snapshotIds: usedSnapshots.map((s) => s.id),
        adjustmentsApplied: {
          condition,
          monthsUsed: monthsUsed ?? null,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      valuationRunId: run.id,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "단일 부품 시세 계산에 실패했습니다." }, { status: 500 });
  }
}
