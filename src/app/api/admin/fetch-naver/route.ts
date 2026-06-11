import { NextResponse } from "next/server";
import { BatchStatus, SnapshotSource } from "@prisma/client";

import { guardAdminRequest } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { runNaverShoppingImport } from "../../../../../scripts/import/naver-shopping";

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;

    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:fetch-naver:${ip}`, 2, 120_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const batch = await prisma.importBatch.create({
      data: { source: SnapshotSource.NAVER_SHOPPING },
    });

    const inserted = await runNaverShoppingImport(batch.id);

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: BatchStatus.COMPLETED,
        completedAt: new Date(),
        recordCount: inserted,
      },
    });

    return NextResponse.json({
      ok: true,
      message: `네이버 쇼핑 신품가 ${inserted}건 저장`,
      inserted,
      batchId: batch.id,
    });
  } catch (error) {
    console.error("[fetch-naver]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "네이버 신품가 업데이트에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
