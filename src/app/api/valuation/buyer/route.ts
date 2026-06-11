import { ListingInputType, ParseStatus, PartCondition, ValuationType } from "@prisma/client";
import { NextResponse } from "next/server";

import { computeBandForPart, findPartByAliasOrName, verdictFromAskingPrice } from "@/lib/valuation";
import { prisma } from "@/lib/prisma";
import { buyerValuationSchema } from "@/lib/schemas";

function splitCandidates(text: string): string[] {
  const compact = text.replace(/\s+/g, " ").trim();
  const chunks = compact.split(/[,\n/]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
  return chunks;
}

export async function POST(req: Request) {
  try {
    const parsed = buyerValuationSchema.safeParse(await req.json());
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

    const bodyText = body.bodyText.trim();

    const askingPriceKrw = body.askingPriceKrw ?? null;
    const sourceUrl = body.sourceUrl?.trim() || null;

    const listing = await prisma.listing.create({
      data: {
        inputType: sourceUrl ? ListingInputType.URL : ListingInputType.TEXT_PASTE,
        rawText: bodyText,
        sourceUrl,
        parseStatus: ParseStatus.PENDING,
      },
    });

    const candidates = splitCandidates(bodyText);
    const matches = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        part: await findPartByAliasOrName(candidate),
      })),
    );

    let matchedCount = 0;
    for (const item of matches) {
      if (item.part) matchedCount++;
      await prisma.listingPartMatch.create({
        data: {
          listingId: listing.id,
          partId: item.part?.id ?? null,
          rawPartText: item.candidate,
          confidence: item.part ? 0.9 : 0.2,
          matchMethod: item.part ? "alias_or_name" : "unmatched",
        },
      });
    }

    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        parseStatus:
          matchedCount === 0 ? ParseStatus.FAILED : matchedCount < candidates.length ? ParseStatus.PARTIAL : ParseStatus.SUCCESS,
        parsedAt: new Date(),
        parseError: matchedCount === 0 ? "매칭된 부품이 없습니다." : null,
      },
    });

    const run = await prisma.valuationRun.create({
      data: {
        runType: ValuationType.BUYER_CHECK,
        listingId: listing.id,
        askingPriceKrw,
      },
    });

    let totalLow = 0;
    let totalMid = 0;
    let totalHigh = 0;

    for (const item of matches) {
      if (!item.part) continue;
      const band = await computeBandForPart(item.part.id, PartCondition.GOOD);
      totalLow += band.low;
      totalMid += band.mid;
      totalHigh += band.high;

      const usedSnapshots = await prisma.priceSnapshot.findMany({
        where: { partId: item.part.id },
        orderBy: { capturedAt: "desc" },
        take: 20,
        select: { id: true },
      });

      await prisma.valuationItem.create({
        data: {
          valuationRunId: run.id,
          partId: item.part.id,
          rawPartLabel: item.candidate,
          fairLowKrw: band.low,
          fairMidKrw: band.mid,
          fairHighKrw: band.high,
          snapshotIds: usedSnapshots.map((s) => s.id),
          adjustmentsApplied: {
            condition: "GOOD",
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
    return NextResponse.json({ ok: false, message: "구매자 분석 처리에 실패했습니다." }, { status: 500 });
  }
}
