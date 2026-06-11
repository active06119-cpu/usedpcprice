import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const category = searchParams.get("category")?.trim();
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);

    const parts = await prisma.part.findMany({
      where: {
        isActive: true,
        OR: q
          ? [
              { fullName: { contains: q, mode: "insensitive" } },
              { modelName: { contains: q, mode: "insensitive" } },
              { aliases: { some: { alias: { contains: q.toLowerCase() } } } },
            ]
          : undefined,
      },
      select: {
        id: true,
        category: true,
        brandName: true,
        modelName: true,
        fullName: true,
        releaseYear: true,
      },
      take: limit,
      orderBy: [{ category: "asc" }, { fullName: "asc" }],
    });

    const filtered =
      category && category.length > 0
        ? parts.filter((part) => part.category === category)
        : parts;

    return NextResponse.json({
      ok: true,
      count: filtered.length,
      items: filtered,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "부품 목록 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
