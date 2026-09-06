export const USED_IMPORT_SOURCES = ["DAANGN", "BUNJANG", "JOONGNA", "MANUAL"] as const;
export type UsedImportSource = (typeof USED_IMPORT_SOURCES)[number];

const ALLOWED = new Set<string>(USED_IMPORT_SOURCES);

export function resolveUsedSource(input: {
  source?: unknown;
  sourceType?: unknown;
  url?: unknown;
  sourceUrl?: unknown;
  defaultSource?: UsedImportSource;
}): UsedImportSource {
  const raw = String(input.source ?? input.sourceType ?? "")
    .trim()
    .toUpperCase();
  if (ALLOWED.has(raw)) return raw as UsedImportSource;

  const url = String(input.url ?? input.sourceUrl ?? "").toLowerCase();
  if (url.includes("daangn.com") || url.includes("karrotmarket.com")) return "DAANGN";
  if (url.includes("bunjang.co.kr")) return "BUNJANG";
  if (url.includes("joongna.com")) return "JOONGNA";
  return input.defaultSource ?? "DAANGN";
}
