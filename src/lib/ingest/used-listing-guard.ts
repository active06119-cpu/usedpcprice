import { shouldPersistUsedPrice } from "../engine/pricing/guards";

/**
 * 중고 매물 적재(파싱 결과 → DB 저장) 직전 검증 게이트.
 *
 * 배경: shouldPersistUsedPrice() 등 검증 함수는 분석/조회 경로에서는 쓰였지만
 * 정작 partsPrice 저장 지점(market/import, url-save)에서는 호출되지 않아
 * 가격 null·범위 밖 가격·엉터리 부품명이 그대로 쌓였다. 이 모듈이 그 문턱을 만든다.
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

/** 부품명이 실제 부품으로 볼 수 있는지 최소 검증 */
const JUNK_NAME = /^(제목\s*없음|없음|미상|unknown|undefined|null|n\/?a|없어요?)$/i;

export function isValidPartName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  if (JUNK_NAME.test(trimmed)) return false;
  // 최소한 영문/숫자/한글이 하나는 있어야 함 (기호·공백 덩어리 제거)
  if (!/[a-zA-Z0-9가-힣]/.test(trimmed)) return false;
  return true;
}

/** 저장해도 되는 행과 걸러낼 행을 분리한다. */
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
