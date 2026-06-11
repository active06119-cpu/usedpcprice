import { prisma } from "@/lib/prisma";

import { buildValidatedPriceBandFromSnaps } from "./bands";
import { applyBuyoutFloor } from "./buyout";
import { isValidNewPrice } from "./guards";
import { newMarketSourceFilter, usedMarketSourceFilter } from "./sources";
import type { ResolvedDbPrice, ResolvedDbPriceInput } from "./types";

const USED_LOOKBACK_DAYS = 60;
const NEW_LOOKBACK_DAYS = 14;

export async function resolvePriceFromDb(
  input: ResolvedDbPriceInput,
): Promise<ResolvedDbPrice | null> {
  const { partId, partName, category, minSamples = 3 } = input;

  const snaps = await prisma.priceSnapshot.findMany({
    where: {
      partId,
      capturedAt: { gte: new Date(Date.now() - USED_LOOKBACK_DAYS * 86_400_000) },
      sourceType: usedMarketSourceFilter(category),
    },
    select: { priceKrw: true, sourceType: true },
    orderBy: { capturedAt: "desc" },
  });

  const band = buildValidatedPriceBandFromSnaps(snaps, partName, category, minSamples);
  if (!band) return null;

  const newSnap = await prisma.priceSnapshot.findFirst({
    where: {
      partId,
      capturedAt: { gte: new Date(Date.now() - NEW_LOOKBACK_DAYS * 86_400_000) },
      sourceType: newMarketSourceFilter(),
    },
    select: { priceKrw: true },
  });

  const rawNewPrice = newSnap?.priceKrw ?? null;
  const newPrice =
    rawNewPrice && isValidNewPrice(rawNewPrice, partName, category) ? rawNewPrice : null;

  const buyout = await applyBuyoutFloor(partId, partName, category, band.usedLow);

  return {
    ...band,
    usedLow: buyout.usedLow ?? band.usedLow,
    newPrice,
    buyoutBasedLow: buyout.buyoutBasedLow,
  };
}
