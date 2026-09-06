import { ListingInputType, ParseStatus, ValuationType } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { parseImportJson } from "@/lib/ingest/json-import";
import { saveManualRows } from "@/lib/ingest/manual-price-writer";

const MAX_ROWS = 500;

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;

    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:import-json:${ip}`, 10, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const body = (await req.json()) as { payload?: unknown; apply?: boolean };
    const parsed = parseImportJson(body.payload);
    const parts = parsed.parts.slice(0, MAX_ROWS);
    const listings = parsed.listings.slice(0, MAX_ROWS);

    if (!body.apply) {
      return NextResponse.json({
        ok: true,
        applied: false,
        partCount: parts.length,
        listingCount: listings.length,
        rejectedCount: parsed.rejected.length,
        parts: parts.slice(0, 200),
        listings: listings.slice(0, 200),
        rejected: parsed.rejected.slice(0, 100),
      });
    }

    if (parts.length === 0 && listings.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "저장할 유효한 행이 없습니다.",
          rejectedCount: parsed.rejected.length,
          rejected: parsed.rejected.slice(0, 100),
        },
        { status: 422 },
      );
    }

    const manual = parts.length > 0 ? await saveManualRows(prisma, parts) : { saved: 0, rejected: [] };

    let listingsSaved = 0;
    for (const row of listings) {
      const listing = await prisma.listing.create({
        data: {
          inputType: row.sourceUrl ? ListingInputType.URL : ListingInputType.TEXT_PASTE,
          rawText: row.rawText,
          sourceUrl: row.sourceUrl ?? null,
          parseStatus: ParseStatus.SUCCESS,
          parsedAt: new Date(),
        },
      });
      await prisma.valuationRun.create({
        data: {
          runType: ValuationType.BUYER_CHECK,
          listingId: listing.id,
          askingPriceKrw: row.askingPriceKrw ?? null,
          verdict: "RISKY",
        },
      });
      listingsSaved += 1;
    }

    return NextResponse.json({
      ok: true,
      applied: true,
      savedParts: manual.saved,
      savedListings: listingsSaved,
      rejectedCount: parsed.rejected.length + manual.rejected.length,
      rejected: [
        ...parsed.rejected,
        ...manual.rejected.map((row) => ({ raw: row.name, reason: row.reason })),
      ].slice(0, 100),
    });
  } catch (error) {
    console.error("[import-json]", error);
    return NextResponse.json(
      { ok: false, message: "JSON 가져오기에 실패했습니다." },
      { status: 500 },
    );
  }
}
