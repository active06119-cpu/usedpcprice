import { ListingInputType, ParseStatus, PartCondition, ValuationType } from "@prisma/client";
import { NextResponse } from "next/server";

import { computeBandForPart, findPartByAliasOrName, verdictFromAskingPrice } from "@/lib/valuation";
import { prisma } from "@/lib/prisma";
import { sellerValuationSchema } from "@/lib/schemas";

function parseSpecs(specsText: string): string[] {
  return specsText
    .split(/\n|\/|,|;/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

export async function POST(req: Request) {
  try {
    const parsed = sellerValuationSchema.safeParse(await req.json());
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

    const specsText = body.specsText.trim();

    const condition = body.condition ? PartCondition[body.condition] : PartCondition.GOOD;
    const monthsUsed = body.monthsUsed;
    const askingPriceKrw = body.askingPriceKrw ?? null;

    const tokens = parseSpecs(specsText);
    const matchedParts = (
      await Promise.all(tokens.map(async (token) => ({ token, part: await findPartByAliasOrName(token) })))
    ).filter((m): m is { token: string; part: NonNullable<typeof m.part> } => Boolean(m.part));

    const listing = await prisma.listing.create({
      data: {
        inputType: ListingInputType.MANUAL,
        rawText: specsText,
        parseStatus: matchedParts.length > 0 ? ParseStatus.SUCCESS : ParseStatus.PARTIAL,
        parsedAt: new Date(),
      },
    });

    const run = await prisma.valuationRun.create({
      data: {
        runType: ValuationType.FULL_PC,
        inputSpecJson: {
          specsText,
          condition,
          monthsUsed,
          hasWarranty: body.hasWarranty ?? null,
        },
        askingPriceKrw,
      },
    });

    let totalLow = 0;
    let totalMid = 0;
    let totalHigh = 0;

    for (const matched of matchedParts) {
      const band = await computeBandForPart(matched.part.id, condition, monthsUsed);
      totalLow += band.low;
      totalMid += band.mid;
      totalHigh += band.high;

      const usedSnapshots = await prisma.priceSnapshot.findMany({
        where: { partId: matched.part.id },
        orderBy: { capturedAt: "desc" },
        take: 20,
        select: { id: true },
      });

      await prisma.valuationItem.create({
        data: {
          valuationRunId: run.id,
          partId: matched.part.id,
          rawPartLabel: matched.token,
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
    }

    const verdict = verdictFromAskingPrice(askingPriceKrw, { low: totalLow, mid: totalMid, high: totalHigh });

    await prisma.valuationRun.update({
      where: { id: run.id },
      data: {
        totalFairLow: totalLow,
        totalFairMid: totalMid,
        totalFairHigh: totalHigh,
        verdict,
      },
    });

    return NextResponse.json({
      ok: true,
      listingId: listing.id,
      valuationRunId: run.id,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "판매자 시세 계산에 실패했습니다." }, { status: 500 });
  }
}
