import { prisma } from "@/lib/prisma";

import { isValidUsedPrice } from "./guards";
import { BUYOUT_SOURCE } from "./sources";

export function mergeUsedLowWithBuyoutPrice(
  usedLow: number | null,
  buyoutPriceKrw: number,
): { usedLow: number; buyoutBasedLow: boolean } {
  const merged = Math.min(usedLow ?? buyoutPriceKrw, buyoutPriceKrw);
  const buyoutBasedLow = usedLow === null || buyoutPriceKrw <= usedLow;
  return { usedLow: merged, buyoutBasedLow };
}

export async function fetchLatestBuyoutSnapshot(partId: string) {
  return prisma.priceSnapshot.findFirst({
    where: {
      partId,
      sourceType: BUYOUT_SOURCE as any,
    },
    orderBy: { capturedAt: "desc" },
    select: { priceKrw: true },
  });
}

export async function applyBuyoutToUsedLow(
  partId: string,
  usedLow: number | null,
): Promise<{ usedLow: number | null; buyoutBasedLow: boolean }> {
  const buyoutSnap = await fetchLatestBuyoutSnapshot(partId);
  if (!buyoutSnap) {
    return { usedLow, buyoutBasedLow: false };
  }

  return mergeUsedLowWithBuyoutPrice(usedLow, buyoutSnap.priceKrw);
}

export async function applyBuyoutFloor(
  partId: string,
  partName: string,
  category: string,
  usedLow: number | null,
): Promise<{ usedLow: number | null; buyoutBasedLow: boolean }> {
  const merged = await applyBuyoutToUsedLow(partId, usedLow);
  if (
    merged.buyoutBasedLow &&
    merged.usedLow !== null &&
    !isValidUsedPrice(merged.usedLow, partName, category)
  ) {
    return { usedLow, buyoutBasedLow: false };
  }

  return merged;
}
