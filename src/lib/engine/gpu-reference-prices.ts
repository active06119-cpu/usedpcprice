// 2025년 6월 다나와 기준 GPU 신품 최저가 (하드코딩)

export const GPU_REFERENCE_NEW_PRICES: Record<string, number> = {
  "RTX 5090": 3500000,
  "RTX 5080": 2000000,
  "RTX 5070 Ti": 1100000,
  "RTX 5070": 750000,
  "RTX 5060 Ti": 810000,
  "RTX 5060": 550000,
  "RTX 4090": 1800000,
  "RTX 4080 SUPER": 1100000,
  "RTX 4080": 950000,
  "RTX 4070 Ti SUPER": 780000,
  "RTX 4070 SUPER": 660000,
  "RTX 4070 Ti": 700000,
  "RTX 4070": 620000,
  "RTX 4060 Ti": 420000,
  "RTX 4060": 310000,
  "RTX 3090 Ti": 900000,
  "RTX 3090": 700000,
  "RTX 3080 Ti": 600000,
  "RTX 3080": 450000,
  "RTX 3070 Ti": 380000,
  "RTX 3070": 330000,
  "RTX 3060 Ti": 250000,
  "RTX 3060": 200000,
  "RX 7900 XTX": 900000,
  "RX 7900 XT": 700000,
  "RX 7800 XT": 450000,
  "RX 7700 XT": 350000,
  "RX 6800 XT": 380000,
  "RX 6700 XT": 280000,
};

const GPU_REFERENCE_KEYS = Object.keys(GPU_REFERENCE_NEW_PRICES).sort(
  (a, b) => b.length - a.length,
);

export function getGpuReferencePrice(partName: string): number | null {
  const upper = partName.toUpperCase();
  for (const key of GPU_REFERENCE_KEYS) {
    if (upper.includes(key.toUpperCase())) {
      return GPU_REFERENCE_NEW_PRICES[key];
    }
  }
  return null;
}

export function findGpuReferenceNewPrice(partName: string): number | null {
  return getGpuReferencePrice(partName);
}

export function getGpuDepreciationRate(releaseYear: number): number {
  const age = 2025 - releaseYear;
  if (age <= 1) return 0.82;
  if (age <= 2) return 0.7;
  if (age <= 3) return 0.55;
  if (age <= 4) return 0.42;
  return 0.35;
}

export function estimateGpuUsedPrice(
  partName: string,
  releaseYear: number,
  condition: "GOOD" | "LIKE_NEW" | "FAIR" = "GOOD",
): { low: number; mid: number; high: number } | null {
  const newPrice = getGpuReferencePrice(partName);
  if (!newPrice) return null;

  const base = getGpuDepreciationRate(releaseYear);

  const conditionMultiplier = {
    LIKE_NEW: 1.15,
    GOOD: 1.0,
    FAIR: 0.8,
  }[condition];

  const mid = Math.round(newPrice * base * conditionMultiplier);
  return {
    low: Math.round(mid * 0.88),
    mid,
    high: Math.round(mid * 1.12),
  };
}
