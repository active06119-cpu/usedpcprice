/**
 * 파싱된 부품 중고가 DB 저장.
 * 같은 sourceUrl은 다시 넣지 않는다.
 */
import type { PrismaClient } from "@prisma/client";
import { PartCategory, PartCondition, SnapshotSource } from "@prisma/client";

import { generateAliases } from "./part-alias";
import type { ManualRow } from "./manual-price-parser";
import { normalizeSourceUrl } from "./listing-url";
import { partitionPersistable, type RejectedRow } from "./used-listing-guard";
import type { UsedImportSource } from "./used-source";

export function extractBrand(name: string): string {
  const n = name.toLowerCase();
  if (/\b(rtx|gtx)\b/.test(n)) return "NVIDIA";
  if (/\brx\b/.test(n)) return "AMD";
  if (/ryzen/.test(n)) return "AMD";
  if (/\b(i[3579]|core|xeon)\b/.test(n)) return "Intel";
  if (/삼성|samsung/.test(n)) return "Samsung";
  return name.split(/\s+/)[0] || "ETC";
}

function partKey(name: string, category: string): string {
  return `${category}::${name.trim().toLowerCase()}`;
}

export async function findOrCreatePart(
  prisma: PrismaClient,
  name: string,
  category: string,
): Promise<string> {
  const existing = await prisma.part.findFirst({
    where: {
      OR: [
        { fullName: { equals: name, mode: "insensitive" } },
        { modelName: { equals: name, mode: "insensitive" } },
        { aliases: { some: { alias: name.toLowerCase().replace(/\s+/g, "") } } },
      ],
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.part.create({
    data: {
      category: category as PartCategory,
      brandName: extractBrand(name),
      modelName: name,
      fullName: name,
      isActive: true,
    },
    select: { id: true },
  });

  const aliases = generateAliases(name);
  if (aliases.length > 0) {
    await prisma.partAlias.createMany({
      data: aliases.map((alias) => ({ partId: created.id, alias, source: "auto-normalize" })),
      skipDuplicates: true,
    });
  }

  return created.id;
}

export type PricedImportRow = ManualRow & {
  url?: string | null;
  sourceType?: UsedImportSource;
};

export type SaveManualResult = {
  saved: number;
  skipped: number;
  rejected: RejectedRow[];
};

export async function savePricedRows(
  prisma: PrismaClient,
  rows: PricedImportRow[],
  fallbackSource: UsedImportSource = "MANUAL",
): Promise<SaveManualResult> {
  const { kept, rejected } = partitionPersistable(
    rows.map((row) => ({
      ...row,
      priceKrw: row.price,
    })),
  );

  const withUrl = kept.map((row) => ({
    ...row,
    url: normalizeSourceUrl((row as PricedImportRow).url ?? "") ?? (row as PricedImportRow).url ?? null,
  }));

  const urls = [...new Set(withUrl.map((row) => row.url).filter((url): url is string => Boolean(url)))];
  const existing = new Set<string>();
  if (urls.length > 0) {
    const found = await prisma.priceSnapshot.findMany({
      where: { sourceUrl: { in: urls } },
      select: { sourceUrl: true },
    });
    for (const row of found) {
      if (row.sourceUrl) existing.add(row.sourceUrl);
    }
  }

  const fresh: typeof withUrl = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const row of withUrl) {
    if (row.url && (existing.has(row.url) || seen.has(row.url))) {
      skipped += 1;
      continue;
    }
    if (row.url) seen.add(row.url);
    fresh.push(row);
  }

  const idCache = new Map<string, string>();
  const unique = new Map<string, { name: string; category: string }>();
  for (const row of fresh) unique.set(partKey(row.name, row.category), { name: row.name, category: row.category });

  const names = [...unique.values()].map((item) => item.name);
  if (names.length > 0) {
    const existingParts = await prisma.part.findMany({
      where: {
        OR: [{ fullName: { in: names, mode: "insensitive" } }, { modelName: { in: names, mode: "insensitive" } }],
      },
      select: { id: true, fullName: true, modelName: true, category: true },
    });
    for (const part of existingParts) {
      idCache.set(partKey(part.fullName, part.category), part.id);
      idCache.set(partKey(part.modelName, part.category), part.id);
    }
  }

  for (const item of unique.values()) {
    const key = partKey(item.name, item.category);
    if (!idCache.has(key)) {
      const id = await findOrCreatePart(prisma, item.name, item.category);
      idCache.set(key, id);
    }
  }

  const snapshotRows = fresh.map((row) => {
    const sourceType = ((row as PricedImportRow).sourceType ?? fallbackSource) as SnapshotSource;
    return {
      partId: idCache.get(partKey(row.name, row.category)) as string,
      sourceType,
      sourceUrl: row.url,
      priceKrw: row.price,
      condition: PartCondition.GOOD,
      rawText: JSON.stringify({ source: sourceType, name: row.name, category: row.category }),
    };
  });

  if (snapshotRows.length > 0) {
    await prisma.priceSnapshot.createMany({ data: snapshotRows });
  }

  return { saved: snapshotRows.length, skipped, rejected };
}

export async function saveManualRows(
  prisma: PrismaClient,
  rows: ManualRow[],
): Promise<SaveManualResult> {
  return savePricedRows(prisma, rows, "MANUAL");
}
