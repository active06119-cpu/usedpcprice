import { NextResponse } from "next/server";

import { guardAdminRequest } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export async function GET(req: Request) {
  const guard = guardAdminRequest(req);
  if (guard) return guard;

  const ip = getClientIp(req);
  const rate = checkRateLimit(`admin:health-check:${ip}`, 60, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const today = startOfToday();

  const [tooLowCount, tooHighCount, todayBuyoutCount, todayBySourceRaw] = await Promise.all([
    prisma.priceSnapshot.count({ where: { priceKrw: { lt: 1_000 } } }),
    prisma.priceSnapshot.count({ where: { priceKrw: { gt: 10_000_000 } } }),
    prisma.priceSnapshot.count({
      where: {
        sourceType: "BUYOUT",
        capturedAt: { gte: today },
      },
    }),
    prisma.priceSnapshot.groupBy({
      by: ["sourceType"],
      where: { capturedAt: { gte: today } },
      _count: { _all: true },
      orderBy: { sourceType: "asc" },
    }),
  ]);

  const todayBySource = todayBySourceRaw.map((row) => ({
    sourceType: row.sourceType,
    count: row._count._all,
  }));

  const hasAnomaly = tooLowCount > 0 || tooHighCount > 0;

  return NextResponse.json({
    ok: true,
    checks: {
      tooLowCount,
      tooHighCount,
      todayBuyoutCount,
      todayBySource,
    },
    hasAnomaly,
  });
}
