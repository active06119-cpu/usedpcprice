import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { aliasesCompatible } from "@/lib/ingest/part-alias";
import { pickBestRamPartId } from "@/lib/ingest/ram-match";
import { parsePastedListings, type PastedPart } from "@/lib/ingest/paste-listing";

async function resolvePartId(part: PastedPart): Promise<string | null> {
  const catalog = await prisma.part.findMany({
    where: { isActive: true, category: part.category as never },
    select: { id: true, fullName: true, modelName: true },
    take: 400,
  });
  if (part.category === "RAM") {
    return pickBestRamPartId(part.name, catalog);
  }
  const hit = catalog.find(
    (row) => aliasesCompatible(part.name, row.fullName) || aliasesCompatible(part.name, row.modelName ?? ""),
  );
  return hit?.id ?? null;
}

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;
    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:parse-listings:${ip}`, 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const body = (await req.json()) as { rawText?: string };
    const rawText = body.rawText?.trim() ?? "";
    if (!rawText) {
      return NextResponse.json({ ok: false, message: "rawText가 필요합니다." }, { status: 400 });
    }

    const parsed = parsePastedListings(rawText).slice(0, 80);
    const items = [];
    for (const listing of parsed) {
      const partCandidates: string[] = [];
      for (const part of listing.parts) {
        const partId = await resolvePartId(part);
        if (partId) partCandidates.push(partId);
      }
      items.push({
        rawText: listing.rawText,
        title: listing.title,
        sourceUrl: listing.sourceUrl ?? undefined,
        askingPriceKrw: listing.askingPriceKrw ?? undefined,
        parts: listing.parts,
        partCandidates: [...new Set(partCandidates)].slice(0, 8),
      });
    }

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "리스트 파싱에 실패했습니다." },
      { status: 500 },
    );
  }
}
