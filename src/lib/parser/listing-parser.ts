import { PartCategory } from "@prisma/client";

import { matchProductToPart } from "@/features/parsing/part-matcher";
import { prisma } from "@/lib/prisma";

export type ParsedPart = {
  rawText: string;
  partId: string | null;
  confidence: number;
  matchMethod: "alias_exact" | "alias_fuzzy" | "pattern" | "unmatched";
  candidates: string[];
};

type AliasCandidate = {
  alias: string;
  partId: string;
  partFullName: string;
  score: number;
};

const PRICE_TOKEN_REGEX = /^\s*\d[\d,]*(?:\.\d+)?\s*(만원|원)\s*$/i;

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function splitListingTokens(rawText: string): string[] {
  return rawText
    .split(/\n|\/|,/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isPriceToken(token: string): boolean {
  return PRICE_TOKEN_REGEX.test(token);
}

function bigrams(value: string): string[] {
  if (value.length < 2) return [value];
  const out: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) {
    out.push(value.slice(i, i + 2));
  }
  return out;
}

function similarityScore(a: string, b: string): number {
  const aa = normalizeToken(a);
  const bb = normalizeToken(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.85;

  const aSet = new Set(bigrams(aa));
  const bSet = new Set(bigrams(bb));
  let overlap = 0;
  for (const g of aSet) {
    if (bSet.has(g)) overlap += 1;
  }
  const denom = aSet.size + bSet.size;
  if (denom === 0) return 0;
  return (2 * overlap) / denom;
}

function mapMatchMethod(
  method: "alias_exact" | "alias_partial" | "pattern" | "unmatched",
  confidence: number,
): ParsedPart["matchMethod"] {
  if (method === "pattern") return "pattern";
  if (method === "unmatched") return "unmatched";
  if (confidence >= 0.99) return "alias_exact";
  return "alias_fuzzy";
}

async function findTopAliasCandidates(token: string, limit = 3): Promise<AliasCandidate[]> {
  const aliases = await prisma.partAlias.findMany({
    include: {
      part: {
        select: { id: true, fullName: true },
      },
    },
  });

  const scored = aliases
    .map((item) => ({
      alias: item.alias,
      partId: item.partId,
      partFullName: item.part.fullName,
      score: similarityScore(token, item.alias),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

async function loadPartCategories(partIds: string[]): Promise<Map<string, PartCategory>> {
  if (partIds.length === 0) return new Map();
  const parts = await prisma.part.findMany({
    where: { id: { in: partIds } },
    select: { id: true, category: true },
  });
  return new Map(parts.map((part) => [part.id, part.category]));
}

export async function parseListingText(rawText: string): Promise<ParsedPart[]> {
  const tokens = splitListingTokens(rawText).filter((token) => !isPriceToken(token));
  if (tokens.length === 0) return [];

  const parsed: ParsedPart[] = [];

  for (const token of tokens) {
    const matched = await matchProductToPart(token);
    const result: ParsedPart = {
      rawText: token,
      partId: matched.partId,
      confidence: Math.max(0, Math.min(1, matched.confidence)),
      matchMethod: mapMatchMethod(matched.method, matched.confidence),
      candidates: [],
    };

    if (result.confidence < 0.7) {
      const candidates = await findTopAliasCandidates(token, 3);
      result.candidates = candidates.map((candidate) => `${candidate.alias} -> ${candidate.partFullName}`);

      if (result.partId === null && candidates.length > 0) {
        result.matchMethod = "alias_fuzzy";
      }
    }

    parsed.push(result);
  }

  const matchedPartIds = Array.from(
    new Set(parsed.map((item) => item.partId).filter((id): id is string => Boolean(id))),
  );
  const categoryByPartId = await loadPartCategories(matchedPartIds);

  const byCategory = new Map<PartCategory, ParsedPart[]>();
  for (const item of parsed) {
    if (!item.partId) continue;
    const category = categoryByPartId.get(item.partId);
    if (!category) continue;
    const bucket = byCategory.get(category) ?? [];
    bucket.push(item);
    byCategory.set(category, bucket);
  }

  for (const [, items] of byCategory) {
    const distinctPartIds = new Set(items.map((item) => item.partId));
    if (items.length < 2 || distinctPartIds.size < 2) continue;

    const peerRawTexts = items.map((item) => item.rawText);
    for (const item of items) {
      item.confidence = 0.5;
      item.matchMethod = "alias_fuzzy";
      const peers = peerRawTexts.filter((raw) => raw !== item.rawText);
      item.candidates = Array.from(new Set([...item.candidates, ...peers])).slice(0, 6);
    }
  }

  return parsed;
}
