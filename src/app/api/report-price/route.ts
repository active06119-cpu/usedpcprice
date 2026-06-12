import { NextRequest, NextResponse } from "next/server";

import { guardAdminRequest } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

type ReportPriceReason = "too_high" | "too_low" | "wrong_part" | "other";

function parseReason(raw: unknown): ReportPriceReason | null {
  if (raw === "too_high" || raw === "too_low") return raw;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`report-price:${ip}`, 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const body = await req.json();
    const partName = String(body.partName ?? "").trim();
    const reportedPrice = Number(body.reportedPrice);
    const reason = parseReason(body.reason);

    if (!partName) {
      return NextResponse.json({ ok: false, message: "partName이 필요합니다." }, { status: 400 });
    }
    if (!Number.isFinite(reportedPrice) || reportedPrice <= 0) {
      return NextResponse.json(
        { ok: false, message: "reportedPrice가 유효하지 않습니다." },
        { status: 400 },
      );
    }
    if (!reason) {
      return NextResponse.json(
        { ok: false, message: 'reason은 "too_high" 또는 "too_low"여야 합니다.' },
        { status: 400 },
      );
    }

    const row = await prisma.reportedPrice.create({
      data: {
        partName,
        reportedPrice: Math.round(reportedPrice),
        reason: reason as any,
      },
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (error) {
    console.error("[report-price]", error);
    return NextResponse.json(
      { ok: false, message: "가격 신고 저장에 실패했습니다." },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const guard = guardAdminRequest(req);
  if (guard) return guard;

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));

  const rows = await prisma.reportedPrice.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ ok: true, items: rows });
}
