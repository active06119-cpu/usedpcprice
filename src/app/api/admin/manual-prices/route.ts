import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { parseManualPriceText } from "@/lib/ingest/manual-price-parser";
import { saveManualRows } from "@/lib/ingest/manual-price-writer";

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;

    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:manual-prices:${ip}`, 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const body = (await req.json()) as { text?: string; apply?: boolean };
    const text = body.text ?? "";
    if (!text.trim()) {
      return NextResponse.json({ ok: false, message: "붙여넣은 내용이 없습니다." }, { status: 400 });
    }

    const { rows, bad } = parseManualPriceText(text);

    // 미리보기: 저장하지 않고 결과만
    if (!body.apply) {
      return NextResponse.json({
        ok: true,
        applied: false,
        validCount: rows.length,
        filteredCount: bad.length,
        rows: rows.slice(0, 200),
        filtered: bad.slice(0, 100),
      });
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, message: `저장할 유효한 줄이 없습니다. (걸러짐 ${bad.length}건)`, filteredCount: bad.length, filtered: bad.slice(0, 100) },
        { status: 422 },
      );
    }

    const saved = await saveManualRows(prisma, rows);

    return NextResponse.json({
      ok: true,
      applied: true,
      saved,
      filteredCount: bad.length,
      filtered: bad.slice(0, 100),
    });
  } catch (error) {
    console.error("[manual-prices]", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "저장에 실패했습니다." },
      { status: 500 },
    );
  }
}
