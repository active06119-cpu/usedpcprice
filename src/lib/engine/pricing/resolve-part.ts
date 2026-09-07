/**
 * 부품 1개의 최종 중고 시세를 DB에서 뽑는다.
 */
import type { PrismaClient } from "@prisma/client";

import { generateAliases } from "../../ingest/part-alias";
import { resolveLayeredUsedBand, type LayeredUsedBand } from "./layered";

const USED_LOOKBACK_DAYS = 90;

export async function findPartId(
  prisma: PrismaClient,
  name: string,
  category: string,
  opts: { loose?: boolean } = {},
): Promise<string | null> {
  const { loose = true } = opts;
  const inputAliases = generateAliases(name);
  const stripped = name
    .replace(/\b\d+\s*(gb|tb|g)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  let p = await prisma.part.findFirst({
    where: {
      OR: [
        { fullName: { equals: name, mode: "insensitive" } },
        { modelName: { equals: name, mode: "insensitive" } },
        { aliases: { some: { alias: { in: inputAliases } } } },
      ],
    },
    select: { id: true },
  });
  if (p) return p.id;
  if (!loose) return null;

  p = await prisma.part.findFirst({
    where: {
      category: category as any,
      OR: [
        { fullName: { contains: stripped, mode: "insensitive" } },
        { modelName: { contains: stripped, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  return p?.id ?? null;
}

export async function resolvePartUsedBand(
  prisma: PrismaClient,
  partId: string,
  category: string,
): Promise<LayeredUsedBand | null> {
  const [buyout, newSnap, listings] = await Promise.all([
    prisma.priceSnapshot.findFirst({
      where: { partId, sourceType: "BUYOUT" as any },
      orderBy: { capturedAt: "desc" },
      select: { priceKrw: true },
    }),
    prisma.priceSnapshot.findFirst({
      where: { partId, sourceType: { in: ["NAVER_SHOPPING", "DANAWA"] as any } },
      orderBy: { capturedAt: "desc" },
      select: { priceKrw: true },
    }),
    prisma.priceSnapshot.findMany({
      where: {
        partId,
        sourceType: { in: ["BUNJANG", "DAANGN", "JOONGNA", "MANUAL"] as any },
        capturedAt: { gte: new Date(Date.now() - USED_LOOKBACK_DAYS * 86_400_000) },
      },
      select: { priceKrw: true },
    }),
  ]);

  return resolveLayeredUsedBand({
    buyoutKrw: buyout?.priceKrw ?? null,
    manualKrw: null,
    newPriceKrw: newSnap?.priceKrw ?? null,
    category,
    listingPrices: listings.map((row) => row.priceKrw),
  });
}
