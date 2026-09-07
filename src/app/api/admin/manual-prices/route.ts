import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { parseManualPriceText, type ManualRow } from "@/lib/ingest/manual-price-parser";
import { saveManualRows } from "@/lib/ingest/manual-price-writer";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;

    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:manual-prices:${ip}`, 40, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const body = (await req.json()) as {
      text?: string;
      apply?: boolean;
      rows?: ManualRow[];
    };

    const parsed = Array.isArray(body.rows) && body.rows.length > 0
      ? { rows: body.rows.slice(0, 40), bad: [] as ReturnType<typeof parseManualPriceText>["bad"] }
      : parseManualPriceText(body.text ?? "");

    if (!body.apply) {
      return NextResponse.json({
        ok: true,
        applied: false,
        validCount: parsed.rows.length,
        filteredCount: parsed.bad.length,
        rows: parsed.rows.slice(0, 200),
        filtered: parsed.bad.slice(0, 100),
      });
    }

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: `저장할 유효한 줄이 없습니다. (걸러짐 ${parsed.bad.length}건)`,
          filteredCount: parsed.bad.length,
          filtered: parsed.bad.slice(0, 100),
        },
        { status: 422 },
      );
    }

    const { saved, rejected } = await saveManualRows(prisma, parsed.rows);
    const extraFiltered = rejected.map((row) => ({
      line: 0,
      raw: row.name,
      reason: row.reason,
    }));

    return NextResponse.json({
      ok: true,
      applied: true,
      saved,
      filteredCount: parsed.bad.length + rejected.length,
      filtered: [...parsed.bad, ...extraFiltered].slice(0, 100),
    });
  } catch (error) {
    console.error("[manual-prices]", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "저장에 실패했습니다." },
      { status: 500 },
    );
  }
}
