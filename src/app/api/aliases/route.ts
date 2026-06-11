import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

    const aliases = await prisma.partAlias.findMany({
      where: {
        alias: q ? { contains: q } : undefined,
        part: {
          isActive: true,
        },
      },
      include: {
        part: {
          select: {
            id: true,
            category: true,
            fullName: true,
          },
        },
      },
      orderBy: { alias: "asc" },
      take: limit,
    });

    return NextResponse.json({
      ok: true,
      count: aliases.length,
      items: aliases.map((item) => ({
        id: item.id,
        alias: item.alias,
        source: item.source,
        part: item.part,
      })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "별칭 목록 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
