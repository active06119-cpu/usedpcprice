import { Prisma } from "@prisma/client";

const META_PREFIX = "\n<!-- market-meta:";
const META_SUFFIX = "-->";

export function isSchemaDriftError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2022") return true;
  const message = error.message.toLowerCase();
  return message.includes("sourceurl") || message.includes("verdict");
}

export function embedMarketMeta(
  description: string,
  meta: { sourceUrl?: string; verdict?: string | null },
): string {
  const cleaned = stripMarketMeta(description);
  return `${cleaned}${META_PREFIX}${JSON.stringify(meta)}${META_SUFFIX}`;
}

export function stripMarketMeta(description: string): string {
  return description.replace(/\n<!-- market-meta:.*?-->/s, "").trimEnd();
}

export function extractMarketMeta(description: string): {
  description: string;
  sourceUrl: string | null;
  verdict: string | null;
} {
  const match = description.match(/<!-- market-meta:(.*?)-->/s);
  if (!match) {
    return { description, sourceUrl: null, verdict: null };
  }

  try {
    const meta = JSON.parse(match[1]) as { sourceUrl?: string; verdict?: string | null };
    return {
      description: description.replace(match[0], "").trimEnd(),
      sourceUrl: meta.sourceUrl ?? null,
      verdict: meta.verdict ?? null,
    };
  } catch {
    return { description: stripMarketMeta(description), sourceUrl: null, verdict: null };
  }
}

export function normalizeMarketListing<T extends { description: string; sourceUrl?: string | null; verdict?: string | null }>(
  row: T,
): T & { description: string; sourceUrl: string | null; verdict: string | null } {
  const meta = extractMarketMeta(row.description);
  return {
    ...row,
    description: meta.description,
    sourceUrl: row.sourceUrl ?? meta.sourceUrl,
    verdict: row.verdict ?? meta.verdict,
  };
}
