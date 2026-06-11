import { prisma } from "@/lib/prisma";

import { buildValidatedPriceBandFromSnaps } from "./bands";
import { applyBuyoutFloor } from "./buyout";
import { isValidNewPrice } from "./guards";
import { newMarketSourceFilter, usedMarketSourceFilter } from "./sources";
import type { ResolvedDbPrice } from "./types";

const USED_LOOKBACK_DAYS = 60;
const NEW_LOOKBACK_DAYS = 14;

export function buildApproxKeyword(partName: string, category?: string): string {
  let name = partName;
  // RAM/SSD는 용량(16GB, 1TB)이 매칭에 필수 — 제거하면 엉뚱한 부품 매칭
  if (category !== "RAM" && category !== "SSD") {
    name = name.replace(/\b\d+(?:\.\d+)?\s*(GB|TB)\b/gi, "");
  }
  return name
    .replace(/\b(TI|SUPER|OC|LHR)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveApproximatePrice(
  partName: string,
  category: string,
): Promise<(ResolvedDbPrice & { partId: string }) | null> {
  const keyword = buildApproxKeyword(partName, category);
  if (!keyword) return null;

  const similarPart = await prisma.part.findFirst({
    where: {
      category: category as any,
      OR: [
        { fullName: { contains: keyword, mode: "insensitive" } },
        { modelName: { contains: keyword, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (!similarPart) return null;

  const snaps = await prisma.priceSnapshot.findMany({
    where: {
      partId: similarPart.id,
      capturedAt: { gte: new Date(Date.now() - USED_LOOKBACK_DAYS * 86_400_000) },
      sourceType: usedMarketSourceFilter(category),
    },
    select: { priceKrw: true, sourceType: true },
    orderBy: { capturedAt: "desc" },
  });

  const band = buildValidatedPriceBandFromSnaps(snaps, partName, category);
  if (!band) return null;

  const newSnap = await prisma.priceSnapshot.findFirst({
    where: {
      partId: similarPart.id,
      capturedAt: { gte: new Date(Date.now() - NEW_LOOKBACK_DAYS * 86_400_000) },
      sourceType: newMarketSourceFilter(),
    },
    select: { priceKrw: true },
  });

  const rawNewPrice = newSnap?.priceKrw ?? null;
  const newPrice =
    rawNewPrice && isValidNewPrice(rawNewPrice, partName, category) ? rawNewPrice : null;

  const buyout = await applyBuyoutFloor(similarPart.id, partName, category, band.usedLow);

  return {
    partId: similarPart.id,
    ...band,
    usedLow: buyout.usedLow ?? band.usedLow,
    newPrice,
    buyoutBasedLow: buyout.buyoutBasedLow,
  };
}
