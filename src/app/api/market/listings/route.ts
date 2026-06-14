import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const items = await prisma.marketListing.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ ok: true, items });
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

    const created = await prisma.marketListing.create({
      data: {
        title: body.title.trim(),
        description: body.description.trim(),
        priceKrw: body.priceKrw as number,
        condition: (body.condition ?? "GOOD") as any,
        location: body.location?.trim() || null,
        contact: body.contact.trim(),
        sourceUrl: parsedUrl.toString(),
        verdict: body.verdict?.trim() || null,
        isFairVerified: Boolean(body.isFairVerified),
        fairPriceMid: Number.isFinite(body.fairPriceMid ?? NaN) ? (body.fairPriceMid as number) : null,
        valuationRunId: body.valuationRunId ?? null,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "등록에 실패했습니다." }, { status: 500 });
  }
}
