import { filterUsedPrices, isMidInValidRange } from "./guards";
import { BUYOUT_SOURCE, isUsedMarketSource, SEED_SOURCE } from "./sources";
import type { PriceBand } from "./types";

export interface PriceSnapshotRow {
  priceKrw: number;
  sourceType: string;
}

export function quantileNearest(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx];
}

export function sanitizeUsedPrices(
  prices: number[],
  partName: string,
  category: string,
): number[] {
  return filterUsedPrices(prices, partName, category).sort((a, b) => a - b);
}

/**
 * 실제 중고 시세 ≥3건이면 SEED 제외.
 * 부족할 때만 SEED로 minSamples를 채우되, 실제 데이터 비중이 더 크게 유지됨.
 */
export function buildUsedPricePool(snaps: PriceSnapshotRow[]): number[] {
  const real = snaps
    .filter((snap) => snap.sourceType !== BUYOUT_SOURCE && isUsedMarketSource(snap.sourceType))
    .map((snap) => snap.priceKrw);
  const seeds = snaps
    .filter((snap) => snap.sourceType === SEED_SOURCE)
    .map((snap) => snap.priceKrw);

  if (real.length >= 3) return real;

  if (real.length > 0) {
    const seedSlots = Math.min(seeds.length, Math.max(0, 3 - real.length));
    return [...real, ...seeds.slice(0, seedSlots)];
  }

  return seeds;
}

export function buildPriceBand(prices: number[]): PriceBand | null {
  if (prices.length === 0) return null;

  return {
    usedLow: quantileNearest(prices, 0.1),
    usedMid: quantileNearest(prices, 0.5),
    usedHigh: quantileNearest(prices, 0.9),
    sampleSize: prices.length,
  };
}

export function buildValidatedPriceBand(
  rawPrices: number[],
  partName: string,
  category: string,
  minSamples = 3,
): PriceBand | null {
  const prices = sanitizeUsedPrices(rawPrices, partName, category);
  if (prices.length < minSamples) return null;

  const band = buildPriceBand(prices);
  if (!band) return null;
  if (!isMidInValidRange(band.usedMid, partName, category)) return null;

  return band;
}

export function buildValidatedPriceBandFromSnaps(
  snaps: PriceSnapshotRow[],
  partName: string,
  category: string,
  minSamples = 3,
): PriceBand | null {
  const pool = buildUsedPricePool(snaps);
  return buildValidatedPriceBand(pool, partName, category, minSamples);
}
