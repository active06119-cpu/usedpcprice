import type { EstimateBand } from "./estimate-band";

export function blendThinSample(
  usedMid: number,
  sampleSize: number,
  estimate: EstimateBand | null,
): { mid: number; low: number; high: number; blended: boolean } {
  if (!estimate || sampleSize >= 3) {
    return {
      mid: usedMid,
      low: Math.round(usedMid * 0.88),
      high: Math.round(usedMid * 1.12),
      blended: false,
    };
  }
  if (estimate.mid <= usedMid * 1.12) {
    return {
      mid: usedMid,
      low: Math.round(usedMid * 0.88),
      high: Math.round(usedMid * 1.12),
      blended: false,
    };
  }
  const mid = Math.round(usedMid * 0.4 + estimate.mid * 0.6);
  return {
    mid,
    low: Math.round(mid * 0.88),
    high: Math.round(mid * 1.12),
    blended: true,
  };
}
