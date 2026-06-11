import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

type ParsedPart = {
  category: "CPU" | "GPU" | "RAM" | "SSD" | "HDD" | "MAINBOARD" | "PSU" | "CASE" | "ETC";
  name: string;
  price: number | null;
  condition: "새상품" | "사용감적음" | "사용감있음" | "알수없음";
};

type SaveBody = {
  sourceUrl: string;
  title: string;
  description: string;
  rawText: string;
  source: string;
  totalPrice: number | null;
  soldStatus: "ACTIVE" | "SOLD" | "RESERVED" | "UNKNOWN";
  registeredAt: string | null;
  parts: ParsedPart[];
};

function toPartCategory(category: ParsedPart["category"]) {
  if (category === "MAINBOARD") return "MOTHERBOARD";
  if (category === "ETC") return "OTHER";
  return category;
}

function toPartCondition(condition: ParsedPart["condition"]) {
  if (condition === "새상품") return "NEW";
  if (condition === "사용감적음") return "GOOD";
  if (condition === "사용감있음") return "FAIR";
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;

    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:url-save:${ip}`, 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const body = (await req.json()) as SaveBody;
    if (!body.sourceUrl || !Array.isArray(body.parts) || body.parts.length === 0) {
      return NextResponse.json({ ok: false, message: "저장할 데이터가 부족합니다." }, { status: 400 });
    }

    const duplicateCount = await prisma.partsPrice.count({ where: { sourceUrl: body.sourceUrl } });
    if (duplicateCount > 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        inserted: 0,
        message: "이미 등록된 URL입니다.",
      });
    }

    const normalizedTitle = body.title.replace(/\s+/g, " ").trim().toLowerCase();
    const nearTime = body.registeredAt ? new Date(new Date(body.registeredAt).getTime() + 6 * 60 * 60 * 1000) : null;
    const nearFrom = body.registeredAt ? new Date(new Date(body.registeredAt).getTime() - 6 * 60 * 60 * 1000) : null;
    const fuzzyDuplicate = await prisma.partsPrice.findFirst({
      where: {
        title: { contains: normalizedTitle.slice(0, 20), mode: "insensitive" },
        priceKrw: body.totalPrice ?? undefined,
        listedAt: nearFrom && nearTime ? { gte: nearFrom, lte: nearTime } : undefined,
      },
      select: { id: true, sourceUrl: true },
    });
    if (fuzzyDuplicate) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        inserted: 0,
        message: `유사 중복 매물로 스킵되었습니다. (기존 URL: ${fuzzyDuplicate.sourceUrl})`,
      });
    }

    const created = await prisma.$transaction(
      body.parts.map((part) =>
        prisma.partsPrice.create({
          data: {
            sourceUrl: body.sourceUrl,
            title: body.title,
            description: body.description,
            rawText: body.rawText,
            listedAt: body.registeredAt ? new Date(body.registeredAt) : null,
            saleStatus: body.soldStatus,
            category: toPartCategory(part.category) as any,
            name: part.name,
            priceKrw: typeof part.price === "number" ? part.price : null,
            condition: toPartCondition(part.condition) as any,
          },
        }),
      ),
    );

    return NextResponse.json({
      ok: true,
      skipped: false,
      inserted: created.length,
    });
  } catch (error) {
    console.error("url save failed:", error);
    return NextResponse.json({ ok: false, message: "DB 저장에 실패했습니다." }, { status: 500 });
  }
}
