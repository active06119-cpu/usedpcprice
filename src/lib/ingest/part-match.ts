import { prisma } from "@/lib/prisma";

import {
  aliasesCompatible,
  digitCore,
  generateAliases,
  primaryModelKey,
} from "@/lib/ingest/part-alias";

type AliasHit = {
  partId: string;
  alias: string;
  fullName: string;
  modelName: string;
};

function rankHit(hit: AliasHit, queryName: string, queryKey: string | null): number {
  const candidateKey = primaryModelKey(hit.fullName) ?? primaryModelKey(hit.modelName);
  let score = 0;
  if (queryKey && candidateKey === queryKey) score += 100;
  if (hit.alias === queryKey) score += 40;
  if (generateAliases(queryName).includes(hit.alias)) score += 20;
  score += Math.min(hit.alias.length, 20);
  return score;
}

function pickBest(hits: AliasHit[], queryName: string): string | null {
  if (hits.length === 0) return null;
  const queryKey = primaryModelKey(queryName);
  const compatible = hits.filter(
    (hit) => aliasesCompatible(queryName, hit.fullName) || aliasesCompatible(queryName, hit.modelName),
  );
  if (compatible.length === 0) return null;
  const ranked = [...compatible].sort(
    (a, b) => rankHit(b, queryName, queryKey) - rankHit(a, queryName, queryKey),
  );
  return ranked[0]?.partId ?? null;
}

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

  const fromAlias = pickBest(
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

  const compatible = parts.filter(
    (part) => aliasesCompatible(partName, part.fullName) || aliasesCompatible(partName, part.modelName),
  );
  if (compatible.length === 0) return null;
  return pickBest(
    compatible.map((part) => ({
      partId: part.id,
      alias: primaryModelKey(part.fullName) ?? part.modelName,
      fullName: part.fullName,
      modelName: part.modelName,
    })),
    partName,
  );
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
