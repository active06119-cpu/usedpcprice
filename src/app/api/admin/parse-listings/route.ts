import { NextResponse } from "next/server";

import { extractListingFromText } from "@/lib/analyze/extract";
import { prisma } from "@/lib/prisma";
import { parseListingText } from "@/lib/parser/listing-parser";
import { guardAdminRequest } from "@/lib/admin-guard";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function extractAskingPriceKrw(text: string): number | undefined {
  const manwonMatch = text.match(/(\d[\d,]*)\s*만원/);
  if (manwonMatch) {
    const n = Number(manwonMatch[1].replace(/,/g, ""));
    if (Number.isFinite(n)) return n * 10_000;
  }

  const wonMatch = text.match(/(\d[\d,]*)\s*원/);
  if (wonMatch) {
    const n = Number(wonMatch[1].replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }

  return undefined;
}

export async function POST(req: Request) {
  try {
    const guard = guardAdminRequest(req);
    if (guard) return guard;
    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin:parse-listings:${ip}`, 30, 60_000);
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

    const lines = rawText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const items = await Promise.all(
      lines.map(async (line) => {
        try {
          const extracted = await extractListingFromText(line);
          const aliasMatches = await Promise.all(
            extracted.parts.map(async (part) => {
              const alias = await prisma.partAlias.findFirst({
                where: { alias: { contains: part.partName.toLowerCase() } },
                select: { partId: true },
              });
              return alias?.partId ?? null;
            }),
          );

          const fallbackPartIds = await Promise.all(
            extracted.parts.map(async (part) => {
              const found = await prisma.part.findFirst({
                where: {
                  OR: [
                    { fullName: { contains: part.partName, mode: "insensitive" } },
                    { modelName: { contains: part.partName, mode: "insensitive" } },
                  ],
                },
                select: { id: true },
              });
              return found?.id ?? null;
            }),
          );

          const partCandidates = Array.from(
            new Set(
              [...aliasMatches, ...fallbackPartIds].filter(
                (id): id is string => typeof id === "string" && id.length > 0,
              ),
            ),
          ).slice(0, 10);

          return {
            rawText: line,
            sourceUrl: undefined,
            askingPriceKrw: extracted.askingPrice ?? extractAskingPriceKrw(line),
            partCandidates,
          };
        } catch {
          const parsed = await parseListingText(line);
          return {
            rawText: line,
            sourceUrl: undefined,
            askingPriceKrw: extractAskingPriceKrw(line),
            partCandidates: Array.from(
              new Set(
                parsed.flatMap((p) =>
                  p.partId ? [p.partId] : p.candidates,
                ),
              ),
            ).slice(0, 10),
          };
        }
      }),
    );

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "리스트 파싱에 실패했습니다." },
      { status: 500 },
    );
  }
}
