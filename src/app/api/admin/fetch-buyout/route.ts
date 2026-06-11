import { NextResponse } from "next/server";

import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { runWorldmemoryBuyoutImport } from "../../../../../scripts/import/sources/worldmemory";

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;

    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:fetch-buyout:${ip}`, 3, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const result = await runWorldmemoryBuyoutImport();

    return NextResponse.json({
      ok: true,
      message: `매입가 ${result.inserted}건 저장 (skip ${result.skipped}, 미매칭 ${result.unmatched})`,
      ...result,
    });
  } catch (error) {
    console.error("[fetch-buyout]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "매입가 업데이트에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
