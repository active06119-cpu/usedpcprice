import { estimateUsedBand } from "@/lib/engine/pricing/estimate-band";
import { findPartId, resolvePartUsedBand } from "@/lib/engine/pricing/resolve-part";
import { sourceLabel } from "@/lib/market-source";
import { prisma } from "@/lib/prisma";

const POPULAR = [
  { name: "RTX 4060", category: "GPU" },
  { name: "RTX 4070", category: "GPU" },
  { name: "RTX 5070", category: "GPU" },
  { name: "RTX 5070 Ti", category: "GPU" },
  { name: "Ryzen 5 5600X", category: "CPU" },
  { name: "i5-14600K", category: "CPU" },
  { name: "DDR5 16GB", category: "RAM" },
  { name: "DDR5 32GB", category: "RAM" },
  { name: "SSD 1TB", category: "SSD" },
] as const;

export type HomeStats = {
  totalSnapshots: number;
  todaySnapshots: number;
  marketListings: number;
};

export type PopularRow = {
  name: string;
  category: string;
  mid: number | null;
  sampleSize: number;
};

export type RecentRow = {
  id: string;
  title: string;
  priceKrw: number;
  sourceLabel: string;
  sourceUrl: string | null;
  at: string;
};

export async function getHomeStats(): Promise<HomeStats> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [totalSnapshots, todaySnapshots, marketListings] = await Promise.all([
    prisma.priceSnapshot.count(),
    prisma.priceSnapshot.count({ where: { capturedAt: { gte: start } } }),
    prisma.marketListing.count({ where: { isActive: true } }),
  ]);
  return { totalSnapshots, todaySnapshots, marketListings };
}

export async function getPopularParts(): Promise<PopularRow[]> {
  const rows: PopularRow[] = [];
  for (const item of POPULAR) {
    const partId = await findPartId(prisma, item.name, item.category, { loose: true });
    const band = partId ? await resolvePartUsedBand(prisma, partId, item.category) : null;
    if (band) {
      rows.push({
        name: item.name,
        category: item.category,
        mid: band.usedMid,
        sampleSize: band.listingSampleSize,
      });
      continue;
    }
    const estimate = estimateUsedBand(item.name, item.category);
    rows.push({
      name: item.name,
      category: item.category,
      mid: estimate?.mid ?? null,
      sampleSize: 0,
    });
  }
  return rows;
}

export async function getRecentListings(limit = 8): Promise<RecentRow[]> {
  const market = await prisma.marketListing.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, priceKrw: true, sourceUrl: true, createdAt: true },
  });

  const fromMarket: RecentRow[] = market.map((row) => ({
    id: row.id,
    title: row.title,
    priceKrw: row.priceKrw,
    sourceLabel: sourceLabel(row.sourceUrl),
    sourceUrl: row.sourceUrl,
    at: row.createdAt.toISOString(),
  }));

  if (fromMarket.length >= limit) return fromMarket.slice(0, limit);

  const seen = new Set(fromMarket.map((row) => row.sourceUrl).filter(Boolean));
  const snaps = await prisma.priceSnapshot.findMany({
    where: {
      sourceUrl: { not: null },
      sourceType: { in: ["DAANGN", "BUNJANG", "JOONGNA", "MANUAL"] as any },
    },
    orderBy: { capturedAt: "desc" },
    take: 40,
    select: {
      id: true,
      priceKrw: true,
      sourceUrl: true,
      capturedAt: true,
      part: { select: { fullName: true } },
    },
  });

  const extra: RecentRow[] = [];
  for (const snap of snaps) {
    if (!snap.sourceUrl || seen.has(snap.sourceUrl)) continue;
    seen.add(snap.sourceUrl);
    extra.push({
      id: snap.id,
      title: snap.part.fullName,
      priceKrw: snap.priceKrw,
      sourceLabel: sourceLabel(snap.sourceUrl),
      sourceUrl: snap.sourceUrl,
      at: snap.capturedAt.toISOString(),
    });
    if (fromMarket.length + extra.length >= limit) break;
  }

  return [...fromMarket, ...extra].slice(0, limit);
}
