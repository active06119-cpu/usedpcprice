import {
  aliasesCompatible,
  generateAliases,
  primaryModelKey,
} from "@/lib/ingest/part-alias";

export type AliasHit = {
  partId: string;
  alias: string;
  fullName: string;
  modelName: string;
};

export function rankHit(hit: AliasHit, queryName: string, queryKey: string | null): number {
  const candidateKey = primaryModelKey(hit.fullName) ?? primaryModelKey(hit.modelName);
  let score = 0;
  if (queryKey && candidateKey === queryKey) score += 100;
  if (hit.alias === queryKey) score += 40;
  if (generateAliases(queryName).includes(hit.alias)) score += 20;
  score += Math.min(hit.alias.length, 20);
  return score;
}

export function pickBestPartId(hits: AliasHit[], queryName: string): string | null {
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
