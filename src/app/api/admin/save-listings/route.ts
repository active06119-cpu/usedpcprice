import { ListingInputType, ParseStatus, ValuationType } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

type ParsedImportRow = {
  rawText: string;
  sourceUrl?: string;
  askingPriceKrw?: number;
  partCandidates: string[];
};

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;
    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:save-listings:${ip}`, 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const body = (await req.json()) as { items?: ParsedImportRow[] };
    const items = body.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, message: "items가 필요합니다." }, { status: 400 });
    }

    let inserted = 0;

    for (const row of items) {
      if (!row.rawText?.trim()) continue;

      const listing = await prisma.listing.create({
        data: {
          inputType: row.sourceUrl ? ListingInputType.URL : ListingInputType.TEXT_PASTE,
          rawText: row.rawText,
          sourceUrl: row.sourceUrl ?? null,
          parseStatus: ParseStatus.SUCCESS,
          parsedAt: new Date(),
        },
      });

      const run = await prisma.valuationRun.create({
        data: {
          runType: ValuationType.BUYER_CHECK,
          listingId: listing.id,
          askingPriceKrw: row.askingPriceKrw ?? null,
          verdict: "RISKY",
        },
      });

      const partIds = row.partCandidates.filter((v) => v.startsWith("c")).slice(0, 5);
      for (const partId of partIds) {
        await prisma.listingPartMatch.create({
          data: {
            listingId: listing.id,
            partId,
            rawPartText: row.rawText,
            confidence: 0.7,
            matchMethod: "admin-import",
          },
        });

        await prisma.valuationItem.create({
          data: {
            valuationRunId: run.id,
            partId,
            rawPartLabel: row.rawText,
            fairLowKrw: null,
            fairMidKrw: null,
            fairHighKrw: null,
            snapshotIds: [],
            adjustmentsApplied: [],
          },
        });
      }

      inserted += 1;
    }

    return NextResponse.json({ ok: true, inserted });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "리스트 저장에 실패했습니다." },
      { status: 500 },
    );
  }
}
