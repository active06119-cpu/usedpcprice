import { prisma } from "@/lib/prisma";

import {
  digitCore,
  generateAliases,
  primaryModelKey,
} from "@/lib/ingest/part-alias";
import { pickBestPartId, type AliasHit } from "@/lib/ingest/part-match-rank";

export async function findPartIdByAliases(
  partName: string,
  category: string,
): Promise<string | null> {
  const cat = category.toUpperCase();
  const keys = generateAliases(partName);
  if (keys.length === 0) return null;

  const aliasRows = await prisma.partAlias.findMany({
    where: {
      alias: { in: keys },
      part: {
        isActive: true,
        category: cat as never,
      },
    },
    select: {
      alias: true,
      partId: true,
      part: { select: { fullName: true, modelName: true } },
    },
    take: 50,
  });

  const fromAlias = pickBestPartId(
    aliasRows.map((row) => ({
      partId: row.partId,
      alias: row.alias,
      fullName: row.part.fullName,
      modelName: row.part.modelName,
    })),
    partName,
  );
  if (fromAlias) return fromAlias;

  const core = digitCore(partName);
  const parts = await prisma.part.findMany({
    where: {
      category: cat as never,
      isActive: true,
      ...(core
        ? {
            OR: [
              { modelName: { contains: core, mode: "insensitive" as const } },
              { fullName: { contains: core, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: { id: true, fullName: true, modelName: true },
    take: 80,
  });

  const hits: AliasHit[] = parts.map((part) => ({
    partId: part.id,
    alias: primaryModelKey(part.fullName) ?? part.modelName,
    fullName: part.fullName,
    modelName: part.modelName,
  }));

  return pickBestPartId(hits, partName);
}

export async function persistGeneratedAliases(partId: string, partName: string): Promise<void> {
  const aliases = generateAliases(partName);
  if (aliases.length === 0) return;
  await prisma.partAlias.createMany({
    data: aliases.map((alias) => ({
      partId,
      alias,
      source: "auto-analyze",
    })),
    skipDuplicates: true,
  });
}
