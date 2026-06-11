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

  const result = await prisma.priceSnapshot.deleteMany({
    where: { priceKrw: { lt: 1000 } },
  });

  return NextResponse.json({
    ok: true,
    deleted: result.count,
    message: `₩1,000 미만 실거래 ${result.count}건을 삭제했습니다.`,
  });
}
