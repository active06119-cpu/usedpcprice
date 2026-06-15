import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import type { AnalyzeResult } from "@/app/api/analyze/route";
import {
  embedMarketMeta,
  isSchemaDriftError,
  normalizeMarketListing,
} from "@/lib/market-listing-meta";
import { prisma } from "@/lib/prisma";

const LEGACY_LISTING_SELECT = {
  id: true,
  title: true,
  description: true,
  priceKrw: true,
  condition: true,
  location: true,
  contact: true,
  isActive: true,
  isFairVerified: true,
  fairPriceMid: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

const FULL_LISTING_SELECT = {
  ...LEGACY_LISTING_SELECT,
  sourceUrl: true,
  verdict: true,
} as const;

export async function GET() {
  try {
    let items: Array<Record<string, unknown>>;

    try {
      items = await prisma.marketListing.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: FULL_LISTING_SELECT,
      });
    } catch (error) {
      if (!isSchemaDriftError(error)) throw error;
      items = await prisma.marketListing.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: LEGACY_LISTING_SELECT,
      });
    }

    return NextResponse.json({
      ok: true,
      items: items.map((row) => normalizeMarketListing(row as any)),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      title?: string;
      description?: string;
      priceKrw?: number;
      condition?: "NEW" | "LIKE_NEW" | "GOOD" | "FAIR" | "POOR";
      location?: string | null;
      contact?: string;
      sourceUrl?: string;
      verdict?: string | null;
      isFairVerified?: boolean;
      fairPriceMid?: number | null;
      valuationRunId?: string | null;
    };

    if (!body.title?.trim() || !body.description?.trim() || !body.contact?.trim()) {
      return NextResponse.json({ ok: false, message: "필수 입력값이 부족합니다." }, { status: 400 });
    }
    if (!body.sourceUrl?.trim()) {
      return NextResponse.json({ ok: false, message: "원본 URL이 필요합니다." }, { status: 400 });
    }
    if (!Number.isFinite(body.priceKrw) || (body.priceKrw ?? 0) <= 0) {
      return NextResponse.json({ ok: false, message: "priceKrw가 올바르지 않습니다." }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(body.sourceUrl.trim());
    } catch {
      return NextResponse.json({ ok: false, message: "원본 URL 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ ok: false, message: "http 또는 https URL만 등록할 수 있습니다." }, { status: 400 });
    }

    const baseData = {
      title: body.title.trim(),
      description: body.description.trim(),
      priceKrw: body.priceKrw as number,
      condition: (body.condition ?? "GOOD") as Prisma.PartCondition,
      location: body.location?.trim() || null,
      contact: body.contact.trim(),
      isFairVerified: Boolean(body.isFairVerified),
      fairPriceMid: Number.isFinite(body.fairPriceMid ?? NaN) ? (body.fairPriceMid as number) : null,
      valuationRunId: body.valuationRunId ?? null,
    };

    const extendedData = {
      ...baseData,
      sourceUrl: parsedUrl.toString(),
      verdict: body.verdict?.trim() || null,
    };

    let created: { id: string };

    try {
      created = await prisma.marketListing.create({
        data: extendedData,
        select: { id: true },
      });
    } catch (error) {
      if (!isSchemaDriftError(error)) throw error;

      created = await prisma.marketListing.create({
        data: {
          ...baseData,
          description: embedMarketMeta(baseData.description, {
            sourceUrl: parsedUrl.toString(),
            verdict: body.verdict?.trim() || null,
          }),
        },
        select: { id: true },
      });
    }

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    console.error("[market/listings POST]", error);
    const message =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? `등록에 실패했습니다. (${error.code})`
        : "등록에 실패했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
