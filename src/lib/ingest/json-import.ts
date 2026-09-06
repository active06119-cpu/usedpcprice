import { shouldPersistUsedPrice } from "@/lib/engine/pricing/guards";
import { MANUAL_CATEGORIES, type ManualRow } from "@/lib/ingest/manual-price-parser";
import {
  isValidListingAskingPrice,
  isValidHttpUrl,
  isValidListingText,
  isValidPartName,
  type ListingPersistCandidate,
} from "@/lib/ingest/used-listing-guard";

export type JsonImportPart = ManualRow & { url?: string | null };
export type JsonImportListing = ListingPersistCandidate & {
  title?: string;
};
export type JsonImportRejected = { raw: string; reason: string };

export type JsonImportResult = {
  parts: JsonImportPart[];
  listings: JsonImportListing[];
  rejected: JsonImportRejected[];
};

const CATEGORY_SET = new Set<string>(MANUAL_CATEGORIES);
const CATEGORY_ALIASES: Record<string, string> = {
  그래픽카드: "GPU",
  그래픽: "GPU",
  VGA: "GPU",
  지포스: "GPU",
  프로세서: "CPU",
  씨피유: "CPU",
  램: "RAM",
  메모리: "RAM",
  에스에스디: "SSD",
  하드: "HDD",
  하드디스크: "HDD",
  메인보드: "MOTHERBOARD",
  보드: "MOTHERBOARD",
  MB: "MOTHERBOARD",
  MAINBOARD: "MOTHERBOARD",
  파워: "PSU",
  파워서플라이: "PSU",
  케이스: "CASE",
  쿨러: "COOLER",
  수냉: "COOLER",
  모니터: "MONITOR",
  기타: "OTHER",
};

function normalizeCategory(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const up = trimmed.toUpperCase();
  if (CATEGORY_SET.has(up)) return up;
  return CATEGORY_ALIASES[trimmed] ?? CATEGORY_ALIASES[up] ?? null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function preview(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 160);
  } catch {
    return String(value);
  }
}

function unwrapRows(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return [];
  const rec = input as Record<string, unknown>;
  const rows: unknown[] = [];
  if (Array.isArray(rec.parts)) rows.push(...rec.parts);
  if (Array.isArray(rec.listings)) rows.push(...rec.listings);
  if (Array.isArray(rec.items)) rows.push(...rec.items);
  return rows;
}

function isPartRow(row: Record<string, unknown>): boolean {
  const kind = asText(row.kind).toLowerCase();
  if (kind === "part" || kind === "parts") return true;
  if (kind === "pc" || kind === "listing" || kind === "listings") return false;
  return Boolean(row.category && (row.priceKrw ?? row.price) && (row.name || row.partName));
}

export function parseImportJson(input: unknown): JsonImportResult {
  const parts: JsonImportPart[] = [];
  const listings: JsonImportListing[] = [];
  const rejected: JsonImportRejected[] = [];

  for (const item of unwrapRows(input)) {
    if (!item || typeof item !== "object") {
      rejected.push({ raw: preview(item), reason: "object가 아닔" });
      continue;
    }
    const row = item as Record<string, unknown>;

    if (isPartRow(row)) {
      const name = asText(row.name) || asText(row.partName);
      const category = normalizeCategory(row.category);
      const price = asNumber(row.priceKrw ?? row.price);
      if (!isValidPartName(name) || !category || price === null) {
        rejected.push({ raw: preview(row), reason: "단품 필드 부족(name/category/price)" });
        continue;
      }
      if (!shouldPersistUsedPrice(price, name, category)) {
        rejected.push({ raw: preview(row), reason: "단품 가격 범위 밖" });
        continue;
      }
      parts.push({
        name,
        category,
        price,
        line: parts.length + 1,
        url: asText(row.url) || null,
      });
      continue;
    }

    const title = asText(row.title);
    const rawText = asText(row.rawText) || title;
    const sourceUrl = asText(row.url) || asText(row.sourceUrl) || null;
    const askingPriceKrw = asNumber(row.priceKrw ?? row.askingPriceKrw ?? row.price);
    if (!isValidListingText(rawText)) {
      rejected.push({ raw: preview(row), reason: "매물 본문 없음" });
      continue;
    }
    if (!isValidHttpUrl(sourceUrl)) {
      rejected.push({ raw: preview(row), reason: "URL 이상" });
      continue;
    }
    if (!isValidListingAskingPrice(askingPriceKrw)) {
      rejected.push({ raw: preview(row), reason: "매물 호가 범위 밖" });
      continue;
    }
    listings.push({
      title: title || undefined,
      rawText,
      sourceUrl,
      askingPriceKrw,
    });
  }

  return { parts, listings, rejected };
}
