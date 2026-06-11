import { prisma } from "@/lib/prisma";

const CATEGORY_MIN: Record<string, number> = {
  GPU: 20_000,
  CPU: 15_000,
  RAM: 10_000,
  SSD: 8_000,
  MOTHERBOARD: 20_000,
  PSU: 15_000,
  CASE: 10_000,
};

const NEW_PRICE_LOOKBACK_MS = 14 * 86_400_000;

export type PriceCandidate = {
  priceKrw: number;
  sourceType: string;
  id: string;
};

export async function validateAndCleanPrices(
  partId: string,
  category: string,
  candidates: PriceCandidate[],
): Promise<{
  valid: { priceKrw: number; sourceType: string }[];
  removed: number;
  removedIds: string[];
}> {
  const cat = category.toUpperCase();
  const categoryMin = CATEGORY_MIN[cat] ?? 1_000;
  const removedIds = new Set<string>();

  let surviving = candidates.filter((row) => {
    if (row.priceKrw < categoryMin) {
      removedIds.add(row.id);
      return false;
    }
    return true;
  });

  const newSnaps = await prisma.priceSnapshot.findMany({
    where: {
      partId,
      sourceType: "NAVER_SHOPPING" as any,
      capturedAt: { gte: new Date(Date.now() - NEW_PRICE_LOOKBACK_MS) },
    },
    select: { priceKrw: true },
    orderBy: { priceKrw: "asc" },
  });
  const newPrice = newSnaps[0]?.priceKrw ?? null;

  if (newPrice && newPrice > 0) {
    const ceiling = newPrice * 0.95;
    surviving = surviving.filter((row) => {
      if (row.priceKrw > ceiling) {
        removedIds.add(row.id);
        return false;
      }
      return true;
    });
  }

  const buyout = await prisma.priceSnapshot.findFirst({
    where: { partId, sourceType: "BUYOUT" as any },
    orderBy: { capturedAt: "desc" },
    select: { priceKrw: true },
  });

  if (buyout?.priceKrw && buyout.priceKrw > 0) {
    const buyoutLow = buyout.priceKrw * 0.7;
    const buyoutHigh = buyout.priceKrw * 3.5;
    surviving = surviving.filter((row) => {
      if (row.priceKrw < buyoutLow || row.priceKrw > buyoutHigh) {
        removedIds.add(row.id);
        return false;
      }
      return true;
    });
  }

  return {
    valid: surviving.map(({ priceKrw, sourceType }) => ({ priceKrw, sourceType })),
    removed: removedIds.size,
    removedIds: [...removedIds],
  };
}
