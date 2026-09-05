export const DEFAULT_IMPORT_SOURCES = ["NAVER_SHOPPING"] as const;

export const ALLOWED_IMPORT_SOURCES = [
  "NAVER_SHOPPING",
  "BUNJANG",
  "DANAWA",
  "DAANGN",
] as const;

export type ImportSourceName = (typeof ALLOWED_IMPORT_SOURCES)[number];

export function resolveImportSources(
  raw = process.env.IMPORT_SOURCES ?? DEFAULT_IMPORT_SOURCES.join(","),
  enableDaangn = process.env.ENABLE_DAANGN_IMPORT === "true",
): ImportSourceName[] {
  const allowed = new Set<string>(ALLOWED_IMPORT_SOURCES);
  return raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is ImportSourceName => {
      if (!allowed.has(value)) return false;
      if (value === "DAANGN" && !enableDaangn) return false;
      return true;
    });
}
