import { PartCondition } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ValueBand = {
  low: number;
  mid: number;
  high: number;
};

const CONDITION_FACTOR: Record<PartCondition, number> = {
  NEW: 1.05,
  LIKE_NEW: 1.0,
  GOOD: 0.95,
  FAIR: 0.85,
  POOR: 0.7,
};

function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = (sortedValues.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  const t = idx - lo;
  return Math.round(sortedValues[lo] * (1 - t) + sortedValues[hi] * t);
}

function ageFactor(monthsUsed?: number): number {
  if (!monthsUsed || monthsUsed <= 0) return 1;
  if (monthsUsed <= 6) return 0.98;
  if (monthsUsed <= 12) return 0.95;
  if (monthsUsed <= 24) return 0.9;
  if (monthsUsed <= 36) return 0.85;
  return 0.8;
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function findPartByAliasOrName(raw: string) {
  const q = normalizeAlias(raw);
  if (!q) return null;

  const alias = await prisma.partAlias.findFirst({
    where: {
      alias: q,
      part: { isActive: true },
    },
    include: { part: true },
  });
  if (alias?.part) return alias.part;

  return prisma.part.findFirst({
    where: {
      isActive: true,
      OR: [
        { fullName: { contains: raw, mode: "insensitive" } },
        { modelName: { contains: raw, mode: "insensitive" } },
      ],
    },
    orderBy: [{ fullName: "asc" }],
  });
}

export async function computeBandForPart(partId: string, condition: PartCondition, monthsUsed?: number): Promise<ValueBand> {
  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      partId,
    },
    orderBy: { capturedAt: "desc" },
    take: 200,
  });

  if (snapshots.length === 0) {
    return { low: 0, mid: 0, high: 0 };
  }

  const now = Date.now();
  const weightedValues: number[] = [];

  for (const snapshot of snapshots) {
    const ageDays = Math.floor((now - snapshot.capturedAt.getTime()) / (24 * 60 * 60 * 1000));
    let weight = 0;
    if (ageDays <= 7) weight = 3;
    else if (ageDays <= 30) weight = 2;
    else if (ageDays <= 60) weight = 1;
    else weight = 0;

    for (let i = 0; i < weight; i += 1) {
      weightedValues.push(snapshot.priceKrw);
    }
  }

  if (weightedValues.length === 0) {
    return { low: 0, mid: 0, high: 0 };
  }

  const values = weightedValues.sort((a, b) => a - b);
  const baseLow = quantile(values, 0.1);
  const baseMid = quantile(values, 0.5);
  const baseHigh = quantile(values, 0.9);

  const factor = CONDITION_FACTOR[condition] * ageFactor(monthsUsed);

  return {
    low: Math.max(Math.round(baseLow * factor), 0),
    mid: Math.max(Math.round(baseMid * factor), 0),
    high: Math.max(Math.round(baseHigh * factor), 0),
  };
}

export function verdictFromAskingPrice(asking: number | null, band: ValueBand): string {
  if (!asking || band.mid <= 0) return "RISKY";
  if (asking <= band.mid * 0.92) return "GOOD_DEAL";
  if (asking <= band.mid * 1.08) return "FAIR";
  if (asking <= band.mid * 1.2) return "SLIGHTLY_OVERPRICED";
  return "OVERPRICED";
}
