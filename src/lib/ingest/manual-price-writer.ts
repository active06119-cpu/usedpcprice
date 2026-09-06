/**
 * 파싱된 부품 중고가 DB 저장.
 * MANUAL은 부품당 1개로 교체, DAANGN/BUNJANG은 URL이 같으면 업데이트.
 */
import type { PrismaClient } from "@prisma/client";
import { PartCategory, PartCondition, SnapshotSource } from "@prisma/client";

import { generateAliases } from "./part-alias";
import type { ManualRow } from "./manual-price-parser";
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

  for (const alias of generateAliases(name)) {
    await prisma.partAlias.upsert({
      where: { partId_alias: { partId: created.id, alias } },
      update: {},
      create: { partId: created.id, alias, source: "auto-normalize" },
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

  let saved = 0;
  for (const r of kept) {
    const partId = await findOrCreatePart(prisma, r.name, r.category);
    const sourceType = ((r as PricedImportRow).sourceType ?? fallbackSource) as SnapshotSource;
    const sourceUrl = (r as PricedImportRow).url ?? null;

    if (sourceType === SnapshotSource.MANUAL) {
      await prisma.priceSnapshot.deleteMany({
        where: { partId, sourceType: SnapshotSource.MANUAL },
      });
    } else if (sourceUrl) {
      const existing = await prisma.priceSnapshot.findFirst({
        where: { partId, sourceType, sourceUrl },
        select: { id: true },
      });
      if (existing) {
        await prisma.priceSnapshot.update({
          where: { id: existing.id },
          data: {
            priceKrw: r.price,
            condition: PartCondition.GOOD,
            rawText: JSON.stringify({ source: sourceType, name: r.name, category: r.category }),
          },
        });
        saved += 1;
        continue;
      }
    }

    await prisma.priceSnapshot.create({
      data: {
        partId,
        sourceType,
        sourceUrl,
        priceKrw: r.price,
        condition: PartCondition.GOOD,
        rawText: JSON.stringify({ source: sourceType, name: r.name, category: r.category }),
      },
    });
    saved += 1;
  }

  return { saved, rejected };
}

export async function saveManualRows(
  prisma: PrismaClient,
  rows: ManualRow[],
): Promise<SaveManualResult> {
  return savePricedRows(prisma, rows, "MANUAL");
}
