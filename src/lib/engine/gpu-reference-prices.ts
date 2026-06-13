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

export const CPU_REFERENCE_NEW_PRICES: Record<string, number> = {
  // Intel 14세대
  "i9-14900K": 520000,
  "i7-14700K": 380000,
  "i5-14600K": 260000,
  "i5-14400F": 180000,
  // Intel 13세대
  "i9-13900K": 480000,
  "i7-13700K": 340000,
  "i5-13600K": 220000,
  "i5-13400F": 160000,
  // Intel 12세대
  "i9-12900K": 350000,
  "i7-12700K": 260000,
  "i5-12600K": 190000,
  "i5-12400F": 140000,
  // AMD Ryzen 7000
  "Ryzen 9 7950X": 620000,
  "Ryzen 9 7900X": 450000,
  "Ryzen 7 7700X": 300000,
  "Ryzen 5 7600X": 210000,
  "Ryzen 7 7800X3D": 380000,
  // AMD Ryzen 5000
  "Ryzen 9 5900X": 280000,
  "Ryzen 7 5800X3D": 260000,
  "Ryzen 7 5800X": 200000,
  "Ryzen 5 5600X": 140000,
  "Ryzen 5 5600": 130000,
};

const CPU_REFERENCE_KEYS = Object.keys(CPU_REFERENCE_NEW_PRICES).sort(
  (a, b) => b.length - a.length,
);

export function getCpuReferencePrice(partName: string): number | null {
  const upper = partName.toUpperCase();
  for (const key of CPU_REFERENCE_KEYS) {
    if (upper.includes(key.toUpperCase())) {
      return CPU_REFERENCE_NEW_PRICES[key];
    }
  }
  return null;
}

export function findCpuReferenceNewPrice(partName: string): number | null {
  return getCpuReferencePrice(partName);
}

export function getCpuDepreciationRate(releaseYear: number): number {
  const age = 2025 - releaseYear;
  if (age <= 1) return 0.78;
  if (age <= 2) return 0.62;
  if (age <= 3) return 0.5;
  if (age <= 4) return 0.42;
  return 0.35;
}

export function estimateCpuUsedPrice(
  partName: string,
  releaseYear: number,
  condition: "GOOD" | "LIKE_NEW" | "FAIR" = "GOOD",
): { low: number; mid: number; high: number } | null {
  const newPrice = getCpuReferencePrice(partName);
  if (!newPrice) return null;

  const base = getCpuDepreciationRate(releaseYear);

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
