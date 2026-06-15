import { NextRequest, NextResponse } from "next/server";

import { guardAdminRequest } from "@/lib/admin-guard";
import { isSchemaDriftError, normalizeMarketListing } from "@/lib/market-listing-meta";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const guard = guardAdminRequest(req);
  if (guard) return guard;

  const ip = getClientIp(req);
  const rate = checkRateLimit(`admin:market-listings:get:${ip}`, 60, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "all";
    const verified = searchParams.get("verified") ?? "all";
    const q = (searchParams.get("q") ?? "").trim();

    const legacySelect = {
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

    const fullSelect = {
      ...legacySelect,
      sourceUrl: true,
      verdict: true,
    } as const;

    let rawItems: Array<Record<string, unknown>>;

    try {
      rawItems = await prisma.marketListing.findMany({
        where: {
          isActive: status === "active" ? true : status === "inactive" ? false : undefined,
          isFairVerified:
            verified === "yes" ? true : verified === "no" ? false : undefined,
          OR: q
            ? [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { contact: { contains: q, mode: "insensitive" } },
              ]
            : undefined,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: fullSelect,
      });
    } catch (error) {
      if (!isSchemaDriftError(error)) throw error;
      rawItems = await prisma.marketListing.findMany({
        where: {
          isActive: status === "active" ? true : status === "inactive" ? false : undefined,
          isFairVerified:
            verified === "yes" ? true : verified === "no" ? false : undefined,
          OR: q
            ? [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { contact: { contains: q, mode: "insensitive" } },
              ]
            : undefined,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: legacySelect,
      });
    }

    const items = rawItems.map((row) => normalizeMarketListing(row as any));

    const [total, activeCount, verifiedCount] = await Promise.all([
      prisma.marketListing.count(),
      prisma.marketListing.count({ where: { isActive: true } }),
      prisma.marketListing.count({ where: { isFairVerified: true, isActive: true } }),
    ]);

    return NextResponse.json({
      ok: true,
      stats: { total, activeCount, verifiedCount },
      count: items.length,
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[admin/market-listings GET]", error);
    return NextResponse.json(
      { ok: false, message: "마켓 목록 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = guardAdminRequest(req);
  if (guard) return guard;

  const ip = getClientIp(req);
  const rate = checkRateLimit(`admin:market-listings:patch:${ip}`, 30, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  try {
    const body = (await req.json()) as {
      id?: string;
      isActive?: boolean;
      isFairVerified?: boolean;
    };

    if (!body.id?.trim()) {
      return NextResponse.json({ ok: false, message: "id가 필요합니다." }, { status: 400 });
    }

    if (body.isActive === undefined && body.isFairVerified === undefined) {
      return NextResponse.json({ ok: false, message: "변경할 필드가 없습니다." }, { status: 400 });
    }

    const updated = await prisma.marketListing.update({
      where: { id: body.id.trim() },
      data: {
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.isFairVerified !== undefined ? { isFairVerified: body.isFairVerified } : {}),
      },
      select: {
        id: true,
        isActive: true,
        isFairVerified: true,
      },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    console.error("[admin/market-listings PATCH]", error);
    return NextResponse.json(
      { ok: false, message: "마켓 매물 수정에 실패했습니다." },
      { status: 500 },
    );
  }
}
