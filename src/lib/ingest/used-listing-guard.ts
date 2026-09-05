import { priceRangeByCategory, shouldPersistUsedPrice } from "../engine/pricing/guards";

/**
 * 중고 매물 적재(파싱 결과 → DB 저장) 직전 검증 게이트.
 *
 * 배경: shouldPersistUsedPrice() 등 검증 함수는 분석/조회 경로에서는 쓰였지만
 * 정작 partsPrice 저장 지점(market/import, url-save)에서는 호출되지 않아
 * 가격 null·범위 밖 가격·엉터리 부품명이 그대로 쌀였다. 이 모듈이 그 문턱을 만든다.
 */

export type PersistCandidate = {
  /** DB에 저장될 정규화된 카테고리 (CPU/GPU/RAM/SSD/HDD/MOTHERBOARD/PSU/CASE/OTHER 등) */
  category: string;
  /** 부품명 */
  name: string;
  /** 파싱된 가격 (없으면 null) */
  priceKrw: number | null;
};

export type RejectReason = "invalid_name" | "no_price" | "price_out_of_range";

export type RejectedRow = {
  name: string;
  priceKrw: number | null;
  reason: RejectReason;
};

export type PartitionResult<T> = {
  kept: T[];
  rejected: RejectedRow[];
};

export type ListingPersistCandidate = {
  rawText: string;
  sourceUrl?: string | null;
  askingPriceKrw?: number | null;
};

export type ListingRejectReason = "invalid_text" | "invalid_url" | "price_out_of_range";

export type RejectedListing = {
  rawText: string;
  reason: ListingRejectReason;
};

export type ListingPartitionResult<T> = {
  kept: T[];
  rejected: RejectedListing[];
};

const JUNK_NAME = /^(제목\s*없음|없음|미상|unknown|undefined|null|n\/?a|없어요?)$/i;
const MAX_LISTING_TEXT = 8_000;
const LISTING_PRICE_RANGE = priceRangeByCategory("OTHER");

export function isValidPartName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  if (JUNK_NAME.test(trimmed)) return false;
  if (!/[a-zA-Z0-9가-힣]/.test(trimmed)) return false;
  return true;
}

export function isValidListingText(rawText: string | null | undefined): boolean {
  if (!rawText) return false;
  const trimmed = rawText.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2 || trimmed.length > MAX_LISTING_TEXT) return false;
  if (JUNK_NAME.test(trimmed)) return false;
  if (!/[a-zA-Z0-9가-힣]/.test(trimmed)) return false;
  return true;
}

export function isValidHttpUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return /^https?:$/i.test(parsed.protocol);
  } catch {
    return false;
  }
}

export function isValidListingAskingPrice(priceKrw: number | null | undefined): boolean {
  if (priceKrw === null || priceKrw === undefined) return true;
  if (!Number.isFinite(priceKrw) || priceKrw <= 0) return false;
  return priceKrw >= LISTING_PRICE_RANGE.min && priceKrw <= LISTING_PRICE_RANGE.max;
}

export function partitionPersistable<T extends PersistCandidate>(
  rows: T[],
): PartitionResult<T> {
  const kept: T[] = [];
  const rejected: RejectedRow[] = [];

  for (const row of rows) {
    if (!isValidPartName(row.name)) {
      rejected.push({ name: row.name, priceKrw: row.priceKrw, reason: "invalid_name" });
      continue;
    }

    if (
      typeof row.priceKrw !== "number" ||
      !Number.isFinite(row.priceKrw) ||
      row.priceKrw <= 0
    ) {
      rejected.push({ name: row.name, priceKrw: row.priceKrw, reason: "no_price" });
      continue;
    }

    if (!shouldPersistUsedPrice(row.priceKrw, row.name, row.category)) {
      rejected.push({ name: row.name, priceKrw: row.priceKrw, reason: "price_out_of_range" });
      continue;
    }

    kept.push(row);
  }

  return { kept, rejected };
}

export function partitionPersistableListings<T extends ListingPersistCandidate>(
  rows: T[],
): ListingPartitionResult<T> {
  const kept: T[] = [];
  const rejected: RejectedListing[] = [];

  for (const row of rows) {
    if (!isValidListingText(row.rawText)) {
      rejected.push({ rawText: row.rawText ?? "", reason: "invalid_text" });
      continue;
    }

    if (!isValidHttpUrl(row.sourceUrl)) {
      rejected.push({ rawText: row.rawText, reason: "invalid_url" });
      continue;
    }

    if (!isValidListingAskingPrice(row.askingPriceKrw)) {
      rejected.push({ rawText: row.rawText, reason: "price_out_of_range" });
      continue;
    }

    kept.push(row);
  }

  return { kept, rejected };
}
