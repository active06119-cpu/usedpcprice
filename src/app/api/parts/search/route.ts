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
        category: category && category.length > 0 ? (category as never) : undefined,
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

    return NextResponse.json({
      ok: true,
      count: parts.length,
      items: parts,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "부품 검색에 실패했습니다." },
      { status: 500 },
    );
  }
}
