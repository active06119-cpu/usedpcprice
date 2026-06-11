import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const guard = guardAdminRequest(_req);
    if (guard) return guard;
    const ip = getClientIp(_req);
    const rate = checkRateLimit(`admin:delete-snapshot:${ip}`, 30, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, message: "id가 필요합니다." }, { status: 400 });
    }

    const result = await prisma.priceSnapshot.deleteMany({
      where: {
        partId: id,
        sourceType: "MANUAL",
      },
    });

    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "거래 데이터 삭제에 실패했습니다." },
      { status: 500 },
    );
  }
}
