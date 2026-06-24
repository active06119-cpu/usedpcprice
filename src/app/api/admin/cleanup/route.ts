import { NextResponse } from "next/server";

import { guardAdminRequest } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const guard = guardAdminRequest(req);
  if (guard) return guard;

  const ip = getClientIp(req);
  const rate = checkRateLimit(`admin:cleanup:${ip}`, 5, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const [tooLow, aiEstimated, unrealisticHigh] = await Promise.all([
    prisma.priceSnapshot.deleteMany({
      where: { priceKrw: { lt: 1000 } },
    }),
    prisma.priceSnapshot.deleteMany({
      where: { sourceType: "AI_ESTIMATED" as any },
    }),
    prisma.priceSnapshot.deleteMany({
      where: { priceKrw: { gt: 10_000_000 } },
    }),
  ]);

  const deleted = tooLow.count + aiEstimated.count + unrealisticHigh.count;

  return NextResponse.json({
    ok: true,
    deleted,
    breakdown: {
      tooLow: tooLow.count,
      aiEstimated: aiEstimated.count,
      unrealisticHigh: unrealisticHigh.count,
    },
    message: `정리 완료: ${deleted}건 삭제 (저가 ${tooLow.count}, AI추정 ${aiEstimated.count}, 고가 ${unrealisticHigh.count})`,
  });
}
